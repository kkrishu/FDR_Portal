'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Logo, LogoMark } from '@/components/ui/logo';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Fingerprint, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';
import { PASSWORD_RULES, passwordSchema } from '@/lib/password';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().optional(),
});

const BANK_ROLES = ['BANK_MANAGER', 'NODAL_OFFICER'];

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.enum(['INSTITUTION', 'OFFICER', 'BANK_MANAGER', 'NODAL_OFFICER', 'AUDITOR']),
    institutionName: z.string().optional(),
    institutionCity: z.string().optional(),
    institutionState: z.string().optional(),
    institutionPhone: z.string().optional(),
    bankId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => data.role !== 'INSTITUTION' || (data.institutionName ?? '').trim().length >= 2,
    { message: 'Tell us what the institution is called', path: ['institutionName'] }
  )
  .refine((data) => !BANK_ROLES.includes(data.role) || Boolean(data.bankId), {
    message: 'Select the bank you belong to',
    path: ['bankId'],
  });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

// Administrator accounts are provisioned by an existing admin from the Users
// page — they are deliberately absent from public sign-up.
const ROLE_OPTIONS = [
  { value: 'INSTITUTION', label: 'Institution' },
  { value: 'OFFICER', label: 'Reviewing Officer' },
  { value: 'BANK_MANAGER', label: 'Bank Manager' },
  { value: 'NODAL_OFFICER', label: 'Nodal Officer' },
  { value: 'AUDITOR', label: 'Auditor' },
] as const;

function LoginView() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'login' | 'register'>(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', mfaCode: '' },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'INSTITUTION',
      institutionName: '',
      institutionCity: '',
      institutionState: '',
      institutionPhone: '',
      bankId: '',
    },
  });

  const registerRole = registerForm.watch('role');

  // Bank and nodal signups attach to a real directory entry, so the form needs
  // the live list. `GET /auth/banks` is public for exactly this purpose.
  const {
    data: banks,
    error: banksError,
    refresh: refreshBanks,
  } = useApi<Array<{ id: string; name: string; code: string }>>(
    registerRole === 'BANK_MANAGER' || registerRole === 'NODAL_OFFICER' ? '/auth/banks' : null
  );

  /**
   * Turns an API error into a message a person can act on. The server returns
   * `{ error: { message, details: { errors: [{ field, message }] } } }` for
   * validation failures; the generic "Validation failed" headline is useless on
   * its own, so the per-field reasons are surfaced instead.
   */
  const readError = (error: any, fallback: string): string => {
    const apiError = error?.response?.error;

    const fieldErrors = apiError?.details?.errors;
    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
      return fieldErrors
        .map((entry: any) => {
          const field = typeof entry.field === 'string' ? entry.field : '';
          const label = field
            ? field
                .replace(/([A-Z])/g, ' $1')
                .toLowerCase()
                .trim()
            : '';
          return label ? `${label}: ${entry.message}` : entry.message;
        })
        .join('. ');
    }

    if (typeof apiError?.message === 'string' && apiError.message) {
      return apiError.message;
    }

    // Network-level failures never reach the API envelope, so translate the
    // common cases instead of showing axios internals to the user.
    const status = error?.status ?? error?.response?.status;
    if (status === 429) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (status === 401) {
      return 'Email or password is incorrect.';
    }
    if (status === 403) {
      return 'This account does not have access to the portal.';
    }
    if (typeof error?.message === 'string' && /network|timeout/i.test(error.message)) {
      return 'Cannot reach the server. Check that the backend is running.';
    }

    return fallback;
  };

  /** Maps server field errors onto react-hook-form so inputs show them inline. */
  const applyFieldErrors = (error: any, form: typeof loginForm | typeof registerForm): boolean => {
    const fieldErrors = error?.response?.error?.details?.errors;
    if (!Array.isArray(fieldErrors) || fieldErrors.length === 0) return false;

    let applied = false;
    for (const entry of fieldErrors) {
      if (typeof entry?.field !== 'string' || typeof entry?.message !== 'string') continue;
      const field = entry.field as any;
      if (field in form.getValues()) {
        (form.setError as any)(field, { type: 'server', message: entry.message });
        applied = true;
      }
    }
    return applied;
  };

  const onLogin = async (data: LoginForm) => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      // Only include the MFA code when the user actually entered one; an empty
      // string would fail server-side validation.
      const request = { ...data };
      if (!request.mfaCode) delete request.mfaCode;

      const response: any = await api.post('/auth/login', request);
      const payload = response?.data ?? {};

      if (payload.mfaRequired) {
        setMfaRequired(true);
        toast.info('Enter the 6-digit code from your authenticator app.');
        return;
      }

      const { user, accessToken, accessTokenExpiry } = payload;
      setAuth(user, {
        accessToken,
        // Refresh token travels as an http-only cookie, so the client keeps an
        // empty placeholder and renews the session through that cookie.
        refreshToken: '',
        accessTokenExpiry,
        refreshTokenExpiry: 0,
      });
      toast.success('Signed in', { description: `Welcome back, ${user?.name ?? 'there'}.` });
      router.push('/dashboard');
    } catch (error: any) {
      const message = readError(error, 'We could not sign you in. Please try again.');
      applyFieldErrors(error, loginForm);
      setFormError(message);
      toast.error('Could not sign in', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRegister = async (data: RegisterForm) => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      const { confirmPassword: _confirm, ...payload } = data;
      // Only send the fields the chosen role actually carries.
      if (payload.role !== 'INSTITUTION') {
        delete payload.institutionName;
        delete payload.institutionCity;
        delete payload.institutionState;
        delete payload.institutionPhone;
      }
      if (!BANK_ROLES.includes(payload.role)) delete payload.bankId;
      const response: any = await api.post('/auth/register', payload);
      const result = response?.data ?? {};

      const { user, accessToken, accessTokenExpiry } = result;
      setAuth(user, {
        accessToken,
        refreshToken: '',
        accessTokenExpiry,
        refreshTokenExpiry: 0,
      });
      toast.success('Account created', {
        description:
          data.role === 'INSTITUTION'
            ? 'Your institution is set up with an empty portfolio — start by submitting an FDR.'
            : BANK_ROLES.includes(data.role)
              ? `You are linked to your bank's verification queue.`
              : 'Welcome to FDR Portal.',
      });
      router.push('/dashboard');
    } catch (error: any) {
      const message = readError(error, 'We could not create your account. Please try again.');
      applyFieldErrors(error, registerForm);
      setFormError(message);
      toast.error('Could not create account', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchTab = (next: 'login' | 'register') => {
    setTab(next);
    setFormError(null);
    setMfaRequired(false);
  };

  return (
    <div className="bg-background flex min-h-screen">
      {/* Brand panel — hidden on small screens where it would crowd the form */}
      <aside className="border-border/60 bg-muted/30 relative hidden w-[45%] max-w-[560px] flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary))_0%,transparent_60%)] opacity-[0.12]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        />

        <Link href="/" className="relative" aria-label="FDR Portal home">
          <Logo markClassName="h-9 w-9" />
        </Link>

        <div className="relative max-w-sm">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.02em]">
            Security deposits, verified end to end.
          </h2>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            Submit, verify, and monitor Fixed Deposit Receipts across institutions, banks, and
            reviewing officers — all in one auditable record.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              'Every FDR hash-verified on upload',
              'Bank confirmation through expiring secure links',
              'Automatic renewal and expiry tracking',
            ].map((line) => (
              <li key={line} className="text-muted-foreground flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground relative text-xs">
          Access is restricted to authorised users. All activity is logged.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/" aria-label="FDR Portal home">
              <Logo />
            </Link>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          </div>

          <div>
            <div className="mb-7">
              <h1
                key={`title-${tab}`}
                className="animate-enter-fade text-2xl font-semibold tracking-tight"
              >
                {tab === 'login' ? 'Sign in' : 'Create your account'}
              </h1>
              <p
                key={`sub-${tab}`}
                className="animate-enter-fade text-muted-foreground mt-1.5 text-sm"
              >
                {tab === 'login'
                  ? 'Use the email address registered with your organisation.'
                  : 'Register with your work email to request portal access.'}
              </p>
            </div>

            <SegmentedTabs value={tab} onChange={(value) => switchTab(value)} />

            {formError && (
              <div
                role="alert"
                className="border-destructive/25 bg-destructive/[0.06] text-destructive mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-relaxed">{formError}</span>
              </div>
            )}

            <AnimatedPanels active={tab} className="mt-6">
              <Panel name="login">
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
                  <Field
                    id="login-email"
                    label="Email"
                    error={loginForm.formState.errors.email?.message}
                  >
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@institution.edu"
                      aria-invalid={Boolean(loginForm.formState.errors.email)}
                      disabled={isSubmitting}
                      {...loginForm.register('email')}
                    />
                  </Field>

                  <Field
                    id="login-password"
                    label="Password"
                    error={loginForm.formState.errors.password?.message}
                    action={
                      <Link
                        href="/forgot-password"
                        className="text-primary text-xs font-medium transition-opacity hover:opacity-80"
                      >
                        Forgot password?
                      </Link>
                    }
                  >
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Your password"
                        className="pr-10"
                        aria-invalid={Boolean(loginForm.formState.errors.password)}
                        disabled={isSubmitting}
                        {...loginForm.register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </Field>

                  {mfaRequired && (
                    <Field
                      id="login-mfa"
                      label="Authentication code"
                      hint="Open your authenticator app and enter the current 6-digit code."
                      error={loginForm.formState.errors.mfaCode?.message}
                    >
                      <Input
                        id="login-mfa"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={6}
                        className="font-mono tracking-[0.35em]"
                        disabled={isSubmitting}
                        {...loginForm.register('mfaCode')}
                      />
                    </Field>
                  )}

                  <Button type="submit" className="mt-2 w-full" size="lg" loading={isSubmitting}>
                    {mfaRequired ? 'Verify code' : 'Sign in'}
                  </Button>
                </form>

                <p className="text-muted-foreground mt-6 text-center text-sm">
                  Need an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className="text-primary font-medium transition-opacity hover:opacity-80"
                  >
                    Register your organisation
                  </button>
                </p>
              </Panel>

              <Panel name="register">
                <form
                  onSubmit={registerForm.handleSubmit(onRegister)}
                  className="space-y-4"
                  noValidate
                >
                  <Field
                    id="register-name"
                    label="Full name"
                    error={registerForm.formState.errors.name?.message}
                  >
                    <Input
                      id="register-name"
                      autoComplete="name"
                      placeholder="Priya Sharma"
                      disabled={isSubmitting}
                      {...registerForm.register('name')}
                    />
                  </Field>

                  <Field
                    id="register-email"
                    label="Work email"
                    error={registerForm.formState.errors.email?.message}
                  >
                    <Input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@institution.edu"
                      disabled={isSubmitting}
                      {...registerForm.register('email')}
                    />
                  </Field>

                  <Field
                    id="register-role"
                    label="Role"
                    error={registerForm.formState.errors.role?.message}
                  >
                    <select
                      id="register-role"
                      disabled={isSubmitting}
                      className={cn(
                        'border-input bg-background flex h-10 w-full rounded-lg border px-3 py-2 text-sm',
                        'focus-visible:ring-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                      )}
                      {...registerForm.register('role')}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {registerRole === 'INSTITUTION' && (
                    <>
                      <Field
                        id="register-institution"
                        label="Institution name"
                        hint="We create your institution's portfolio automatically — it starts empty and belongs to you."
                        error={registerForm.formState.errors.institutionName?.message}
                      >
                        <Input
                          id="register-institution"
                          autoComplete="organization"
                          placeholder="Government Engineering College"
                          disabled={isSubmitting}
                          {...registerForm.register('institutionName')}
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field id="register-city" label="City" hint="Optional">
                          <Input
                            id="register-city"
                            autoComplete="address-level2"
                            placeholder="Ahmedabad"
                            disabled={isSubmitting}
                            {...registerForm.register('institutionCity')}
                          />
                        </Field>
                        <Field id="register-state" label="State" hint="Optional">
                          <Input
                            id="register-state"
                            autoComplete="address-level1"
                            placeholder="Gujarat"
                            disabled={isSubmitting}
                            {...registerForm.register('institutionState')}
                          />
                        </Field>
                      </div>

                      <Field
                        id="register-phone"
                        label="Office phone"
                        hint="Optional — you can complete these in Profile later."
                      >
                        <Input
                          id="register-phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="079 2685 1234"
                          disabled={isSubmitting}
                          {...registerForm.register('institutionPhone')}
                        />
                      </Field>
                    </>
                  )}

                  {(registerRole === 'BANK_MANAGER' || registerRole === 'NODAL_OFFICER') && (
                    <Field
                      id="register-bank"
                      label="Your bank"
                      hint={
                        banksError
                          ? 'Could not load the bank directory. Check your connection and try again.'
                          : registerRole === 'NODAL_OFFICER'
                            ? 'Nodal officers confirm deposits on behalf of this bank.'
                            : 'Your verification queue is scoped to this bank.'
                      }
                      error={registerForm.formState.errors.bankId?.message}
                    >
                      {banksError ? (
                        <button
                          type="button"
                          onClick={() => void refreshBanks()}
                          className="border-destructive/30 bg-destructive/[0.04] text-destructive h-10 w-full rounded-lg border px-3 text-left text-[13px]"
                        >
                          Retry loading the bank directory
                        </button>
                      ) : (
                        <select
                          id="register-bank"
                          disabled={isSubmitting}
                          className={cn(
                            'border-input bg-background focus-visible:ring-primary flex h-10 w-full rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                            'disabled:cursor-not-allowed disabled:opacity-50'
                          )}
                          {...registerForm.register('bankId')}
                        >
                          <option value="">
                            {banks === undefined
                              ? 'Loading banks…'
                              : (banks?.length ?? 0) === 0
                                ? 'No banks in the directory yet — contact an administrator'
                                : 'Select your bank…'}
                          </option>
                          {(banks ?? []).map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}

                  <Field
                    id="register-password"
                    label="Password"
                    error={registerForm.formState.errors.password?.message}
                  >
                    <Input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Create a password"
                      disabled={isSubmitting}
                      {...registerForm.register('password')}
                    />
                    <PasswordChecklist value={registerForm.watch('password') ?? ''} />
                  </Field>

                  <Field
                    id="register-confirm"
                    label="Confirm password"
                    error={registerForm.formState.errors.confirmPassword?.message}
                  >
                    <Input
                      id="register-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      disabled={isSubmitting}
                      {...registerForm.register('confirmPassword')}
                    />
                  </Field>

                  <Button type="submit" className="mt-2 w-full" size="lg" loading={isSubmitting}>
                    Create account
                  </Button>

                  <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
                    Accounts are active immediately. Your role decides which dashboard you land on;
                    administrator accounts are created by an existing admin.
                  </p>
                </form>

                <p className="text-muted-foreground mt-6 text-center text-sm">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="text-primary font-medium transition-opacity hover:opacity-80"
                  >
                    Sign in
                  </button>
                </p>
              </Panel>
            </AnimatedPanels>
          </div>

          <div className="text-muted-foreground mt-10 flex items-center justify-center gap-5 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              TLS encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" />
              MFA supported
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Audited access
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Segmented control for switching between Sign in and Register.
 *
 * The active pill is a single element that slides between the two labels, so the
 * transition reads as one object moving rather than two states blinking.
 */
function SegmentedTabs({
  value,
  onChange,
}: {
  value: 'login' | 'register';
  onChange: (value: 'login' | 'register') => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
    if (!active) return;
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value]);

  // Measure before paint so the pill never animates in from the wrong position.
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const options = [
    { value: 'login', label: 'Sign in' },
    { value: 'register', label: 'Register' },
  ] as const;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Sign in or register"
      className="bg-muted/70 border-border/60 relative grid h-10 grid-cols-2 gap-1 rounded-xl border p-1"
    >
      <span
        aria-hidden
        className="bg-background absolute inset-y-1 rounded-lg shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          data-value={option.value}
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 rounded-lg text-[13px] font-medium transition-colors duration-200',
            value === option.value
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Cross-fades the two forms inside a grid stack.
 *
 * Both panels stay mounted (so a half-typed registration is not lost when the
 * user peeks at the sign-in form) but only the active one is visible and
 * focusable. The container height follows the active panel so the page below
 * does not jump.
 */
function AnimatedPanels({
  active,
  className,
  children,
}: {
  active: 'login' | 'register';
  className?: string;
  children: React.ReactNode;
}) {
  const panels = Array.isArray(children) ? children : [children];
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const activeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (activeRef.current) setHeight(activeRef.current.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (activeRef.current) observer.observe(activeRef.current);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div
      className={cn(
        'relative grid transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        className
      )}
      style={{ height }}
    >
      {panels.map((panel) => {
        const name = (panel as React.ReactElement<PanelProps>).props.name;
        const isActive = name === active;
        return (
          <div
            key={name}
            ref={isActive ? activeRef : undefined}
            role="tabpanel"
            aria-hidden={!isActive}
            {...(isActive ? {} : { inert: '' as any })}
            className={cn(
              'col-start-1 row-start-1 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              isActive
                ? 'pointer-events-auto translate-y-0 opacity-100 blur-0'
                : 'pointer-events-none -translate-y-1.5 opacity-0 blur-[2px]'
            )}
          >
            {panel}
          </div>
        );
      })}
    </div>
  );
}

interface PanelProps {
  name: 'login' | 'register';
  children: React.ReactNode;
}

/** Marker component; AnimatedPanels reads `name` off each child. */
function Panel({ children }: PanelProps) {
  return <>{children}</>;
}

function PasswordChecklist({ value }: { value: string }) {
  // Show the rules up front instead of letting the server reject the form with
  // a message the user cannot act on.
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 text-[11px] transition-colors',
              met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
            )}
          >
            <CheckCircle2 className={cn('h-3 w-3 shrink-0', met ? 'opacity-100' : 'opacity-30')} />
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  action,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function LoginPageContent() {
  // `useSearchParams` opts the tree into client-side rendering, so it must sit
  // behind a Suspense boundary for the route to prerender.
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginView />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="bg-primary/10 absolute inset-0 rounded-2xl blur-xl" />
          <LogoMark className="relative h-8 w-8" id="fdr-logo-skeleton" />
        </div>
        <p className="text-muted-foreground text-sm">Loading sign in…</p>
      </div>
    </div>
  );
}

export default LoginPageContent;
