'use client';

/**
 * Settings.
 *
 * Account security (password, MFA, active sessions) and appearance. Everything here talks to a
 * real endpoint: password changes revoke other sessions, MFA setup returns a
 * genuine TOTP secret, and the theme choice is applied app-wide.
 */

import * as React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import {
  Copy,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  LogOut,
  Smartphone,
  Monitor as MonitorIcon,
  Globe,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/hooks/use-api';
import { PASSWORD_RULES } from '@/lib/password';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

interface Session {
  id: string;
  deviceFingerprint: string;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  createdAt: string;
  lastActiveAt: string;
}

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

  // --- Session Management ---
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);
  const [currentFingerprint, setCurrentFingerprint] = React.useState<string | null>(null);

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const response: any = await api.get('/auth/sessions');
      setSessions(response?.data ?? []);
      // Identify current session by fingerprint
      const fp = await generateFingerprint();
      setCurrentFingerprint(fp);
    } catch (error) {
      toast.error('Could not load sessions', { description: getErrorMessage(error) });
    } finally {
      setSessionsLoading(false);
    }
  };

  const generateFingerprint = async (): Promise<string> => {
    const userAgent = navigator.userAgent;
    const acceptLanguage = navigator.languages.join(',');
    const data = `${userAgent}|${acceptLanguage}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32);
  };

  const revokeSession = async (sessionId: string, isCurrent: boolean) => {
    if (isCurrent) {
      toast.error(
        'Cannot revoke current session from here. Use "Sign out everywhere else" instead.'
      );
      return;
    }
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast.success('Session revoked');
      void fetchSessions();
    } catch (error) {
      toast.error('Could not revoke session', { description: getErrorMessage(error) });
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      await api.delete('/auth/sessions');
      toast.success('Signed out from all other devices');
      void fetchSessions();
    } catch (error) {
      toast.error('Could not revoke sessions', { description: getErrorMessage(error) });
    }
  };

  const getDeviceInfo = (userAgent: string | null) => {
    if (!userAgent) return { type: 'Unknown', icon: Globe };
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return { type: 'Mobile', icon: Smartphone };
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return { type: 'Tablet', icon: MonitorIcon };
    }
    return { type: 'Desktop', icon: MonitorIcon };
  };

  const getCountryFlag = (countryCode?: string | null) => {
    if (!countryCode) return '🌐';
    return String.fromCodePoint(
      ...countryCode
        .toUpperCase()
        .split('')
        .map((c) => 127397 + c.charCodeAt(0))
    );
  };

  React.useEffect(() => {
    void fetchSessions();
  }, []);

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

        {/* Active Sessions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <Smartphone className="h-4 w-4" />
              Active sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {sessionsLoading ? (
              <div className="space-y-3">
                {[0, 1].map((key) => (
                  <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="bg-muted h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-6 text-center">
                <Smartphone className="text-muted-foreground/50 mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-2">No active sessions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => {
                  const isCurrent = session.deviceFingerprint === currentFingerprint;
                  const device = getDeviceInfo(session.userAgent);
                  const DeviceIcon = device.icon;
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                        isCurrent
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border/50 hover:bg-accent/30'
                      )}
                    >
                      <DeviceIcon
                        className={cn(
                          'h-8 w-8 shrink-0',
                          isCurrent ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{device.type}</span>
                          {isCurrent && (
                            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                              Current session
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate font-mono text-[11px]">
                          {session.ipAddress ?? 'Unknown IP'}
                          {session.city && (
                            <span className="ml-2 flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {session.city}, {session.region || ''}, {session.country || ''}
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-[10px]">
                          {session.userAgent ?? 'Unknown device'}
                        </p>
                        <div className="text-muted-foreground flex items-center gap-3 text-[10px]">
                          <span>Created: {formatDateTime(session.createdAt)}</span>
                          <span>Last active: {formatDateTime(session.lastActiveAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isCurrent ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void revokeAllOtherSessions()}
                          >
                            <LogOut className="mr-1.5 h-3.5 w-3.5" />
                            Sign out elsewhere
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => void revokeSession(session.id, false)}
                          >
                            <LogOut className="mr-1.5 h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
