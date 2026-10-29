'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  FileText,
  Building2,
  Users,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const steps = [
  { id: 'token', label: 'Token', icon: Shield },
  { id: 'otp', label: 'OTP', icon: Shield },
  { id: 'verify', label: 'Verify', icon: CheckCircle },
];

function BankVerifyView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || (params.token as string);

  const [currentStep, setCurrentStep] = useState(0);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [confirmations, setConfirmations] = useState({
    amountConfirmed: false,
    issueDateConfirmed: false,
    maturityDateConfirmed: false,
    fdrNumberConfirmed: false,
    jointHoldersConfirmed: false,
    lienConfirmed: false,
  });
  const [remarks, setRemarks] = useState('');
  const [outcome, setOutcome] = useState<'verified' | 'flagged' | null>(null);

  // Fetch verification data on mount
  useEffect(() => {
    if (token) {
      fetchVerificationData();
    }
  }, [token]);

  const fetchVerificationData = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/verification/bank-verify', { token });
      setVerificationData(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to load verification data');
    } finally {
      setIsLoading(false);
    }
  };

  const requestOtp = async () => {
    try {
      await api.post('/verification/otp', { token });
      toast.success('OTP sent to registered email');
      setCurrentStep(1);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to send OTP');
    }
  };

  /**
   * Sends the confirmation state to the server. `rejecting` marks every field
   * unconfirmed, which the backend records as a flagged (not verified) result —
   * the old behaviour cleared the checkboxes and did nothing, leaving the bank
   * with no way to report a mismatch.
   */
  const submitVerification = async (rejecting = false) => {
    try {
      setIsLoading(true);
      const payload = rejecting
        ? {
            token,
            otp,
            amountConfirmed: false,
            issueDateConfirmed: false,
            maturityDateConfirmed: false,
            fdrNumberConfirmed: false,
            jointHoldersConfirmed: false,
            lienConfirmed: false,
            remarks: remarks || 'Details could not be confirmed against branch records.',
          }
        : { token, otp, ...confirmations, remarks };

      await api.post('/verification/verify', payload);
      setOutcome(rejecting ? 'flagged' : 'verified');
      setCurrentStep(3);
      toast.success(rejecting ? 'Mismatch reported' : 'Verification submitted successfully');
    } catch (error: any) {
      toast.error(
        error?.response?.error?.message || 'Verification failed. Check the OTP and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmationChange = (key: string, value: boolean) => {
    setConfirmations((prev) => ({ ...prev, [key]: value }));
  };

  if (!verificationData && !isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <XCircle className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">Invalid Verification Link</h2>
              <p className="text-muted-foreground mb-6">
                This verification link has expired or is invalid. Please request a new verification
                link.
              </p>
              <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading && !verificationData) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading verification details...</p>
        </div>
      </div>
    );
  }

  const { fdr, bankBranch, tokenExpiry } = verificationData || {};

  const allConfirmed = Object.values(confirmations).every((v) => v);

  return (
    <div className="from-background to-muted min-h-screen bg-gradient-to-b px-4 py-12">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold">Bank Verification</h1>
          <p className="text-muted-foreground mt-2">
            Verify FDR details against your core banking records
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    index < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : index === currentStep
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {index < currentStep ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-16 transition-colors',
                      index < currentStep ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-muted-foreground flex justify-center gap-4 text-sm">
            {steps.map((step, index) => (
              <span
                key={step.id}
                className={cn('px-2', index === currentStep ? 'text-foreground font-medium' : '')}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>

        {/* Token Expiry Warning */}
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              This verification link expires on <strong>{formatDateTime(tokenExpiry)}</strong>
            </span>
          </div>
        </div>

        {/* FDR Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              FDR Details
            </CardTitle>
            <CardDescription>
              Please verify all details against your core banking records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailRow label="FDR Number" value={fdr?.fdrNumber} />
              <DetailRow label="Bank" value={fdr?.bankName} />
              <DetailRow label="Branch" value={fdr?.branchName} />
              <DetailRow label="Amount" value={formatCurrency(fdr?.amount || 0)} />
              <DetailRow label="Issue Date" value={formatDate(fdr?.issueDate)} />
              <DetailRow label="Maturity Date" value={formatDate(fdr?.maturityDate)} />
            </div>

            {/* Joint Holders */}
            {fdr?.jointHolders?.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <Users className="h-4 w-4" />
                  Joint Holders
                </h4>
                <div className="space-y-2">
                  {fdr.jointHolders.map((holder: any, index: number) => (
                    <div key={index} className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{holder.name}</span>
                        <Badge variant={holder.isAICTE ? 'success' : 'secondary'}>
                          {holder.isAICTE ? 'AICTE' : 'Institution'}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-1 flex gap-4 text-sm">
                        <span>PAN: {holder.pan}</span>
                        <span>{holder.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lien Details */}
            {fdr?.lienDetails && (
              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <Shield className="h-4 w-4" />
                  Lien Details
                </h4>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Lien Holder:</span>
                      <span className="ml-2 font-medium">{fdr.lienDetails.lienHolderName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PAN:</span>
                      <span className="ml-2 font-medium">{fdr.lienDetails.lienHolderPAN}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="ml-2 font-medium">
                        {formatCurrency(fdr.lienDetails.lienAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Period:</span>
                      <span className="ml-2 font-medium">
                        {formatDate(fdr.lienDetails.lienStartDate)} -{' '}
                        {fdr.lienDetails.lienEndDate
                          ? formatDate(fdr.lienDetails.lienEndDate)
                          : 'Ongoing'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Documents */}
            {fdr?.documents?.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4" />
                  Documents
                </h4>
                <div className="space-y-2">
                  {fdr.documents.map((doc: any, index: number) => (
                    <div
                      key={index}
                      className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="text-muted-foreground h-5 w-5" />
                        <div>
                          <p className="font-medium">{doc.fileName}</p>
                          <p className="text-muted-foreground text-xs capitalize">
                            {doc.type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline"
                      >
                        View <ArrowRight className="inline h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 1: Token Validation */}
          {currentStep === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Verify Access</CardTitle>
                <CardDescription>
                  Confirm you have received the secure verification link
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-6">
                  You have accessed the verification page using a secure link sent to the
                  bank&apos;s registered contact. Please click &ldquo;Request OTP&rdquo; to receive
                  a one-time password for verification.
                </p>
                <Button
                  onClick={requestOtp}
                  size="lg"
                  className="w-full sm:w-auto"
                  loading={isLoading}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Request OTP
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: OTP Verification */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Enter OTP</CardTitle>
                <CardDescription>
                  A 6-digit OTP has been sent to the registered email
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-center gap-2">
                    {[...Array(6)].map((_, i) => (
                      <Input
                        key={i}
                        type={showOtp ? 'text' : 'password'}
                        maxLength={1}
                        value={otp[i] || ''}
                        onChange={(e) => {
                          const newOtp = otp.split('');
                          newOtp[i] = e.target.value;
                          setOtp(newOtp.join(''));
                          if (e.target.value && i < 5) {
                            const nextInput = document.querySelector(
                              `input[data-index="${i + 1}"]`
                            ) as HTMLInputElement;
                            nextInput?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otp[i] && i > 0) {
                            const prevInput = document.querySelector(
                              `input[data-index="${i - 1}"]`
                            ) as HTMLInputElement;
                            prevInput?.focus();
                          }
                        }}
                        data-index={i}
                        className="h-12 w-12 text-center text-2xl"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowOtp(!showOtp)}>
                      {showOtp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showOtp ? 'Hide' : 'Show'} OTP
                    </Button>
                  </div>
                  <Button
                    onClick={() => setCurrentStep(2)}
                    className="w-full"
                    disabled={otp.length !== 6}
                  >
                    Continue to details
                  </Button>
                  <p className="text-muted-foreground text-center text-[11.5px]">
                    The code is checked when you submit your confirmation.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Confirmation */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Step 3: Confirm Details</CardTitle>
                <CardDescription>
                  Compare each field with your core banking records and confirm
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConfirmationItem
                  label="Amount"
                  description={`FDR Amount: ${formatCurrency(fdr?.amount || 0)}`}
                  confirmed={confirmations.amountConfirmed}
                  onChange={(v) => handleConfirmationChange('amountConfirmed', v)}
                />
                <ConfirmationItem
                  label="Issue Date"
                  description={`Issue Date: ${formatDate(fdr?.issueDate)}`}
                  confirmed={confirmations.issueDateConfirmed}
                  onChange={(v) => handleConfirmationChange('issueDateConfirmed', v)}
                />
                <ConfirmationItem
                  label="Maturity Date"
                  description={`Maturity Date: ${formatDate(fdr?.maturityDate)}`}
                  confirmed={confirmations.maturityDateConfirmed}
                  onChange={(v) => handleConfirmationChange('maturityDateConfirmed', v)}
                />
                <ConfirmationItem
                  label="FDR Number"
                  description={`FDR Number: ${fdr?.fdrNumber}`}
                  confirmed={confirmations.fdrNumberConfirmed}
                  onChange={(v) => handleConfirmationChange('fdrNumberConfirmed', v)}
                />
                <ConfirmationItem
                  label="Joint Holders"
                  description={`${fdr?.jointHolders?.length || 0} joint holder(s) listed`}
                  confirmed={confirmations.jointHoldersConfirmed}
                  onChange={(v) => handleConfirmationChange('jointHoldersConfirmed', v)}
                />
                <ConfirmationItem
                  label="Lien Details"
                  description={
                    fdr?.lienDetails
                      ? `Lien: ${formatCurrency(fdr.lienDetails.lienAmount)}`
                      : 'No lien details'
                  }
                  confirmed={confirmations.lienConfirmed}
                  onChange={(v) => handleConfirmationChange('lienConfirmed', v)}
                />

                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="remarks">Remarks (Optional)</Label>
                    <textarea
                      id="remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-primary min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      placeholder="Add any remarks or discrepancies found..."
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => void submitVerification(true)}
                    disabled={isLoading}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Report mismatch
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => void submitVerification(false)}
                    disabled={!allConfirmed || isLoading}
                    loading={isLoading}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm all & submit
                  </Button>
                </div>
                {!allConfirmed && (
                  <p className="text-muted-foreground text-center text-[11.5px]">
                    Confirm every item to verify, or report a mismatch if any detail differs.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {currentStep === 3 && (
            <Card
              className={cn(
                'border',
                outcome === 'verified'
                  ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10'
                  : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
              )}
            >
              <CardContent className="pt-6 text-center">
                <div
                  className={cn(
                    'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full',
                    outcome === 'verified'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-red-100 text-red-600'
                  )}
                >
                  {outcome === 'verified' ? (
                    <CheckCircle className="h-8 w-8" />
                  ) : (
                    <XCircle className="h-8 w-8" />
                  )}
                </div>
                <h2 className="mb-2 text-xl font-semibold">
                  {outcome === 'verified' ? 'Verification complete' : 'Mismatch reported'}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {outcome === 'verified'
                    ? 'Every detail matched your records. The institution and the reviewing officer have been notified.'
                    : 'Your branch reported that the details do not match. The institution and the reviewing officer have been notified.'}
                </p>
                <Button variant="outline" onClick={() => window.close()}>
                  Close window
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="text-muted-foreground mt-8 text-center text-sm">
          <p>FDR Portal - Secure Bank Verification</p>
          <p>This link is valid until {formatDateTime(tokenExpiry)}</p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      <p className="text-lg font-medium">{value}</p>
    </div>
  );
}

function ConfirmationItem({
  label,
  description,
  confirmed,
  onChange,
}: {
  label: string;
  description: string;
  confirmed: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 rounded-lg border-2 p-4 transition-colors',
        confirmed ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-muted bg-muted/50'
      )}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: confirmed ? 'rgb(34, 197, 94)' : 'rgb(148, 163, 184)',
        }}
      >
        {confirmed ? (
          <CheckCircle className="h-5 w-5 text-white" />
        ) : (
          <XCircle className="h-5 w-5 text-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <label className="relative flex h-6 w-11 items-center">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onChange(e.target.checked)}
          className="bg-muted border-input peer h-6 w-11 appearance-none rounded-full border"
        />
        <span className="absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BankVerifyPage() {
  // The view reads `?token=…`, so it needs a Suspense boundary to prerender.
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-primary h-7 w-7 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading verification…</p>
          </div>
        </div>
      }
    >
      <BankVerifyView />
    </Suspense>
  );
}
