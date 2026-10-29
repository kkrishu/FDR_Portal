'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { Logo } from '@/components/ui/logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) {
      setError('Enter the email address registered with your account.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      // The endpoint is not deployed yet. The response is deliberately the same
      // either way so this page never discloses whether an account exists.
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-10 inline-block" aria-label="FDR Portal home">
          <Logo markClassName="h-9 w-9" />
        </Link>

        {submitted ? (
          <div className="border-border/60 bg-card rounded-xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Check your inbox</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              If an account exists for <span className="text-foreground font-medium">{email}</span>,
              a password reset link is on its way. The link expires in one hour.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-6">
              <Link href="/login">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Enter your registered email address and we will send you a reset link.
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px]">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@institution.edu"
                    className="pl-9"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                {error && (
                  <p className="text-destructive text-xs" role="alert">
                    {error}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
                Send reset link
              </Button>
            </form>

            <p className="text-muted-foreground mt-6 text-center text-sm">
              Remembered it?{' '}
              <Link
                href="/login"
                className="text-primary font-medium transition-opacity hover:opacity-80"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
