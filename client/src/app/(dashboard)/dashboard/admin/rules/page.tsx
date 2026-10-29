'use client';

/**
 * Rules.
 *
 * The live workflow thresholds. Editing writes through to `PATCH /admin/rules`,
 * which records the change in the audit log — so a rules change is always
 * attributable.
 */

import * as React from 'react';
import { Loader2, RotateCcw, Save, Settings } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useApi, useApiMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { formatDateTime } from '@/lib/utils';

type RulesValue = Record<string, unknown>;

const GROUPS: Array<{
  title: string;
  description: string;
  fields: Array<{ key: string; label: string; type: 'number' | 'text'; hint?: string }>;
}> = [
  {
    title: 'Bank verification',
    description: 'How the portal nudges a branch that has not confirmed a deposit.',
    fields: [
      {
        key: 'bankReminderDays',
        label: 'Reminder days (comma separated)',
        type: 'text',
        hint: 'e.g. 1,2',
      },
      { key: 'bankNoReplyEscalationHours', label: 'Escalate after (hours)', type: 'number' },
      { key: 'bankAdminEscalationDays', label: 'Admin escalation after (days)', type: 'number' },
    ],
  },
  {
    title: 'Maturity tracking',
    description: 'When an institution is reminded that a deposit is maturing.',
    fields: [
      {
        key: 'maturityReminderDays',
        label: 'Reminder days (comma separated)',
        type: 'text',
        hint: 'e.g. 60,30,15,7,1',
      },
      { key: 'overdueRenewalEscalationDays', label: 'Overdue escalation (days)', type: 'number' },
    ],
  },
  {
    title: 'Release workflow',
    description: 'Service levels for moving a release request through to approval.',
    fields: [
      { key: 'releaseSLAHours', label: 'Overall SLA (hours)', type: 'number' },
      {
        key: 'releaseStageSLAHours',
        label: 'Stage SLAs (JSON)',
        type: 'text',
        hint: '{"recommendation":24,"approval":48}',
      },
      {
        key: 'releaseConditions',
        label: 'Conditions (JSON)',
        type: 'text',
        hint: '{"requireNodalSignOff":true}',
      },
    ],
  },
  {
    title: 'Verification security',
    description: 'How long a link or code stays usable.',
    fields: [
      { key: 'otpExpiryMinutes', label: 'OTP expiry (minutes)', type: 'number' },
      { key: 'otpMaxAttempts', label: 'OTP attempts allowed', type: 'number' },
      { key: 'verificationTokenExpiryHours', label: 'Link expiry (hours)', type: 'number' },
    ],
  },
  {
    title: 'Deposit limits',
    description: 'Guardrails on the amounts a submission may declare.',
    fields: [
      { key: 'minimumFdrAmount', label: 'Minimum amount (₹)', type: 'number' },
      { key: 'maxFdrAmount', label: 'Maximum amount (₹)', type: 'number' },
      { key: 'duplicateDetectionWindowDays', label: 'Duplicate window (days)', type: 'number' },
    ],
  },
];

export default function AdminRulesPage() {
  const { data: current, meta, isLoading, refresh } = useApi<RulesValue>('/rules/categories');
  const { data: rows } = useApi<RulesValue[]>('/rules');

  const [form, setForm] = React.useState<RulesValue>({});
  const [error, setError] = React.useState<string | null>(null);

  const lastUpdated = Array.isArray(rows) && rows[0] ? (rows[0] as any).updatedAt : null;

  React.useEffect(() => {
    if (current) setForm({ ...current });
  }, [current]);

  const save = useApiMutation('/admin/rules', 'patch', {
    successMessage: 'Rules saved',
    revalidate: ['/rules', '/rules/categories'],
    onSuccess: () => {
      setError(null);
      void refresh();
    },
  });

  const handleSave = async () => {
    setError(null);
    // JSON-typed fields are entered as text; validate them before sending.
    for (const group of GROUPS) {
      for (const field of group.fields) {
        if (field.hint?.includes('JSON')) {
          try {
            const raw = form[field.key];
            if (typeof raw === 'string') JSON.parse(raw);
          } catch {
            setError(`${field.label} is not valid JSON.`);
            return;
          }
        }
      }
    }
    try {
      await save.run(form);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(current ?? {});

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Rules"
          description="Workflow thresholds that drive reminders, escalations, and limits."
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!isDirty || save.isMutating}
                onClick={() => setForm({ ...(current ?? {}) })}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!isDirty || save.isMutating}
              >
                {save.isMutating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Save rules
              </Button>
            </>
          }
        />

        {(error || save.errorMessage) && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {error ?? save.errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 py-5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {GROUPS.map((group) => (
              <Card key={group.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-[14px] font-semibold">
                    <Settings className="h-3.5 w-3.5" />
                    {group.title}
                  </CardTitle>
                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                    {group.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3.5 pt-0">
                  {group.fields.map((field) => {
                    const value = form[field.key];
                    const display =
                      value === null || value === undefined
                        ? ''
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value);

                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`rule-${field.key}`} className="text-[12px]">
                          {field.label}
                        </Label>
                        <Input
                          id={`rule-${field.key}`}
                          inputMode={field.type === 'number' ? 'numeric' : 'text'}
                          value={display}
                          onChange={(event) => {
                            const raw = event.target.value;
                            setForm((current) => ({
                              ...current,
                              [field.key]:
                                field.type === 'number' && raw !== ''
                                  ? Number(raw)
                                  : raw === ''
                                    ? undefined
                                    : raw,
                            }));
                          }}
                          className="h-9"
                        />
                        {field.hint && (
                          <p className="text-muted-foreground font-mono text-[10.5px]">
                            {field.hint}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {lastUpdated && (
          <p className="text-muted-foreground border-t pt-4 text-[11.5px]">
            Last updated {formatDateTime(lastUpdated)}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
