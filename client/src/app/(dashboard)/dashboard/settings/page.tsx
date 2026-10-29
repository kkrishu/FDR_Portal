'use client';

/**
 * Settings.
 *
 * Account security (password, MFA) and appearance. Everything here talks to a
 * real endpoint: password changes revoke other sessions, MFA setup returns a
 * genuine TOTP secret, and the theme choice is applied app-wide.
 */

import * as React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Copy, KeyRound, Loader2, Monitor, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/hooks/use-api';
import { PASSWORD_RULES } from '@/lib/password';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // --- change password ---
  const [passwords, setPasswords] = React.useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [savingPassword, setSavingPassword] = React.useState(false);

  const passwordChecks = PASSWORD_RULES.map((rule) => ({
    ...rule,
    met: rule.test(passwords.next),
  }));
  const passwordValid = passwordChecks.every((check) => check.met);

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (!passwordValid) {
      setPasswordError('The new password does not meet the requirements yet.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.next,
      });
      toast.success('Password changed', {
        description: 'Other sessions have been signed out.',
      });
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (error) {
      setPasswordError(getErrorMessage(error, 'Could not change the password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  // --- MFA ---
  const [mfaSetup, setMfaSetup] = React.useState<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  } | null>(null);
  const [mfaToken, setMfaToken] = React.useState('');
  const [mfaBusy, setMfaBusy] = React.useState(false);
  const [mfaPassword, setMfaPassword] = React.useState('');
  const mfaEnabled = user?.mfaEnabled ?? false;

  const startMfa = async () => {
    setMfaBusy(true);
    try {
      const response: any = await api.post('/auth/mfa/setup', {});
      setMfaSetup(response?.data ?? null);
    } catch (error) {
      toast.error('Could not start MFA setup', { description: getErrorMessage(error) });
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfa = async () => {
    if (!mfaSetup) return;
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/verify', { token: mfaToken });
      if (user) setUser({ ...user, mfaEnabled: true });
      toast.success('Two-factor authentication enabled');
      setMfaSetup(null);
      setMfaToken('');
    } catch (error) {
      toast.error('That code did not match', { description: getErrorMessage(error) });
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    if (!mfaPassword) {
      toast.error('Enter your password to disable MFA');
      return;
    }
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/disable', { password: mfaPassword });
      if (user) setUser({ ...user, mfaEnabled: false });
      toast.success('Two-factor authentication disabled');
      setMfaPassword('');
    } catch (error) {
      toast.error('Could not disable MFA', { description: getErrorMessage(error) });
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Settings" description="Security and appearance for your account." />

        {/* Appearance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = mounted && theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border px-3 py-3.5 text-[12px] font-medium transition-all duration-200 active:scale-[0.98]',
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-3 text-[11.5px]">
              System follows your device setting and switches automatically.
            </p>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <KeyRound className="h-4 w-4" />
              Change password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="current-password" className="text-[12.5px]">
                Current password
              </Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, current: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-[12.5px]">
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) =>
                    setPasswords((current) => ({ ...current, next: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-[12.5px]">
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) =>
                    setPasswords((current) => ({ ...current, confirm: event.target.value }))
                  }
                />
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-1">
              {passwordChecks.map((check) => (
                <li
                  key={check.id}
                  className={cn(
                    'flex items-center gap-1.5 text-[11px]',
                    check.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full',
                      check.met ? 'bg-current' : 'bg-current opacity-30'
                    )}
                  />
                  {check.label}
                </li>
              ))}
            </ul>

            {passwordError && (
              <p className="text-destructive text-[12px]" role="alert">
                {passwordError}
              </p>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-muted-foreground text-[11.5px]">
                Changing your password signs out other devices.
              </p>
              <Button
                size="sm"
                onClick={() => void handleChangePassword()}
                disabled={savingPassword || !passwords.current || !passwordValid}
              >
                {savingPassword && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* MFA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-[15px] font-semibold">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Two-factor authentication
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
                  mfaEnabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {mfaEnabled ? 'On' : 'Off'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!mfaEnabled && !mfaSetup && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                  Add a second factor with any authenticator app. Officers, administrators and nodal
                  officers will be asked for a code at sign-in once enabled.
                </p>
                <Button size="sm" onClick={() => void startMfa()} disabled={mfaBusy}>
                  {mfaBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Set up authenticator
                </Button>
              </div>
            )}

            {mfaSetup && !mfaEnabled && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  {mfaSetup.qrCodeUrl && (
                    <Image
                      src={mfaSetup.qrCodeUrl}
                      alt="Scan this QR code with your authenticator app"
                      width={140}
                      height={140}
                      unoptimized
                      className="rounded-lg border bg-white p-1.5"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[12.5px] leading-relaxed">
                      Scan the code, or enter this secret manually:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 font-mono text-[11px]">
                        {mfaSetup.secret}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          void navigator.clipboard.writeText(mfaSetup.secret);
                          toast.success('Secret copied');
                        }}
                        aria-label="Copy secret"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mfa-token" className="text-[12.5px]">
                    Enter the 6-digit code
                  </Label>
                  <Input
                    id="mfa-token"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="w-40 font-mono tracking-[0.3em]"
                    value={mfaToken}
                    onChange={(event) => setMfaToken(event.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void confirmMfa()}
                    disabled={mfaBusy || mfaToken.length !== 6}
                  >
                    {mfaBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Verify and enable
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMfaSetup(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {mfaEnabled && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                  Your account requires a code from your authenticator app at sign-in. Disabling it
                  lowers the security of the account.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mfa-disable-password" className="text-[12.5px]">
                      Confirm with your password
                    </Label>
                    <Input
                      id="mfa-disable-password"
                      type="password"
                      autoComplete="current-password"
                      className="w-56"
                      value={mfaPassword}
                      onChange={(event) => setMfaPassword(event.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void disableMfa()}
                    disabled={mfaBusy || !mfaPassword}
                  >
                    {mfaBusy ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-4 w-4" />
                    )}
                    Disable
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-muted-foreground text-[11.5px]">
          Signed in as <span className="text-foreground font-medium">{user?.email}</span>
        </p>
      </div>
    </DashboardLayout>
  );
}
