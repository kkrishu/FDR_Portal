'use client';

/**
 * Webhooks.
 *
 * Outgoing event subscriptions with delivery history. Creating one registers
 * the URL; sending a test event confirms the endpoint is reachable before a
 * real workflow depends on it.
 *
 * Webhooks work like a "reverse API" - instead of you polling for updates,
 * the portal pushes events to your endpoint in real-time via HTTP POST.
 * Each event is signed with HMAC-SHA256 so you can verify it's authentic.
 */

import * as React from 'react';
import {
  Activity,
  Loader2,
  Plus,
  Send,
  Trash2,
  Webhook,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi, useApiMutation, useDynamicMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  _count?: { deliveries: number };
}

interface DeadLetterEntry {
  id: string;
  event: string;
  payload: any;
  responseStatus: number | null;
  responseBody: string | null;
  attempts: number;
  lastError: string | null;
  failedAt: string;
}

const EVENT_CATEGORIES = {
  'FDR Events': ['fdr.submitted', 'fdr.verified', 'fdr.flagged', 'fdr.expired', 'fdr.renewed'],
  'Verification Events': ['verification.completed'],
  'Flag Events': ['flag.created', 'flag.resolved'],
  'Release Events': [
    'release.requested',
    'release.recommended',
    'release.approved',
    'release.rejected',
    'release.completed',
  ],
  'User Events': [
    'user.created',
    'user.updated',
    'user.deleted',
    'user.login',
    'user.logout',
    'password.changed',
    'mfa.enabled',
    'mfa.disabled',
  ],
  'Webhook Events': ['webhook.created', 'webhook.updated', 'webhook.deleted'],
  'Settings Events': ['rules.updated'],
  'Institution/Bank Events': [
    'institution.created',
    'institution.updated',
    'bank.created',
    'bank.updated',
  ],
  'API Key Events': ['api_key.created', 'api_key.revoked'],
};

const FLAT_EVENTS = Object.values(EVENT_CATEGORIES).flat();

const EMPTY_FORM = { name: '', url: '', events: ['fdr.submitted'] as string[] };

export default function AdminWebhooksPage() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'webhooks' | 'dead-letter'>('webhooks');
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'webhooks' | 'dead-letter');
  };
  const [selectedWebhookId, setSelectedWebhookId] = React.useState<string | null>(null);
  const [dlqExpanded, setDlqExpanded] = React.useState<Record<string, boolean>>({});

  const { data, isLoading, errorMessage, refresh } = useApi<WebhookRow[]>('/webhooks');

  const createWebhook = useApiMutation('/webhooks', 'post', {
    successMessage: 'Webhook registered',
    revalidate: ['/webhooks'],
    onSuccess: () => {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
  });

  const testWebhook = useDynamicMutation('post', { errorMessage: false });
  const deleteWebhook = useDynamicMutation('delete', {
    successMessage: 'Webhook removed',
    revalidate: ['/webhooks'],
  });

  const { data: dlqData, isLoading: dlqLoading } = useApi<DeadLetterEntry[]>(
    selectedWebhookId ? [`/webhooks/${selectedWebhookId}/dead-letter`] : null
  );

  const retryDlq = useDynamicMutation('post', {
    successMessage: 'Retry initiated',
    revalidate: selectedWebhookId ? [`/webhooks/${selectedWebhookId}/dead-letter`] : [],
  });

  const rows = data ?? [];
  const dlqEntries = dlqData ?? [];

  const handleCreate = async () => {
    setFormError(null);
    try {
      await createWebhook.run({ ...form, events: form.events, secret: '' });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result: any = await testWebhook.run(`/webhooks/${id}/test`, {});
      const ok = result?.success ?? result?.delivered;
      if (ok) {
        // Result already toasted by the hook when a message is configured.
      }
    } finally {
      setTestingId(null);
      void refresh();
    }
  };

  const handleViewDeadLetter = (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    setActiveTab('dead-letter');
  };

  const toggleEvent = (event: string) => {
    setForm((current) => ({
      ...current,
      events: current.events.includes(event)
        ? current.events.filter((item) => item !== event)
        : [...current.events, event],
    }));
  };

  const toggleDlqExpand = (id: string) => {
    setDlqExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatPayload = (payload: any) => {
    return JSON.stringify(payload, null, 2);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Webhooks"
          description="HTTP endpoints that receive portal events as they happen. Events are signed with HMAC-SHA256 for verification."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setCreateOpen(true);
                setActiveTab('webhooks');
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New webhook
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="webhooks">
              <Webhook className="mr-1.5 h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="dead-letter">
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              Dead Letter Queue
            </TabsTrigger>
          </TabsList>

          {/* WEBHOOKS TAB */}
          <TabsContent value="webhooks" className="space-y-4">
            {errorMessage && (
              <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
                {errorMessage}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((key) => (
                  <Card key={key}>
                    <CardContent className="space-y-2.5 py-5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="py-4">
                  <EmptyState
                    icon={Webhook}
                    title="No webhooks"
                    description="Register an endpoint to receive FDR and release events."
                    action={
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        New webhook
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rows.map((webhook, index) => (
                  <Card
                    key={webhook.id}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="truncate text-[14px] font-semibold">
                              {webhook.name}
                            </CardTitle>
                            <StatusBadge status={webhook.isActive ? 'ACTIVE' : 'INACTIVE'} />
                          </div>
                          <p className="text-muted-foreground mt-1 truncate font-mono text-[11.5px]">
                            {webhook.url}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleTest(webhook.id)}
                            disabled={testingId === webhook.id}
                          >
                            {testingId === webhook.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Send test
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDeadLetter(webhook.id)}
                          >
                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                            Dead letters
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive h-9 w-9"
                            onClick={() => void deleteWebhook.run(`/webhooks/${webhook.id}`)}
                            aria-label={`Delete ${webhook.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        {webhook.events.map((event) => (
                          <span
                            key={event}
                            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10.5px]"
                          >
                            {event}
                          </span>
                        ))}
                        <span className="text-muted-foreground ml-1 flex items-center gap-1 text-[11px]">
                          <Activity className="h-3 w-3" />
                          {webhook._count?.deliveries ?? 0} deliveries
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-2 text-[10.5px]">
                        Created {formatDateTime(webhook.createdAt)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* DEAD LETTER QUEUE TAB */}
          <TabsContent value="dead-letter" className="space-y-4">
            {selectedWebhookId ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Showing failed deliveries for selected webhook.
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedWebhookId(null);
                        setActiveTab('webhooks');
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Back to webhooks
                    </Button>
                  </p>
                </div>
                {dlqLoading ? (
                  <div className="space-y-3">
                    {[0, 1].map((key) => (
                      <Card key={key}>
                        <CardContent className="space-y-2.5 py-5">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : dlqEntries.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <EmptyState
                        icon={AlertTriangle}
                        title="No dead letter entries"
                        description="All webhook deliveries succeeded or are still being retried."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {dlqEntries.map((entry, index) => (
                      <Card
                        key={entry.id}
                        className="animate-fade-in-up border-destructive/20"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5 font-mono text-[10px] font-medium',
                                    entry.responseStatus === 0
                                      ? 'bg-destructive/10 text-destructive'
                                      : 'bg-warning/10 text-warning'
                                  )}
                                >
                                  {entry.responseStatus === 0
                                    ? 'Network Error'
                                    : `HTTP ${entry.responseStatus}`}
                                </span>
                                <span className="text-muted-foreground text-[11px]">
                                  {entry.attempts} attempts
                                </span>
                              </div>
                              <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                                Event: {entry.event}
                              </p>
                              <p className="text-muted-foreground mt-0.5 text-[11px]">
                                Failed: {formatDateTime(entry.failedAt)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void retryDlq.run(
                                    `/webhooks/${selectedWebhookId}/dead-letter/${entry.id}/retry`,
                                    {}
                                  )
                                }
                              >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                Retry
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground h-9 w-9"
                                onClick={() => toggleDlqExpand(entry.id)}
                                aria-label={dlqExpanded[entry.id] ? 'Collapse' : 'Expand'}
                              >
                                {dlqExpanded[entry.id] ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {dlqExpanded[entry.id] && (
                          <CardContent className="space-y-3 pt-0">
                            {entry.lastError && (
                              <div className="bg-destructive/5 border-destructive/20 rounded-lg border p-3">
                                <p className="text-destructive mb-1 text-[11px] font-medium">
                                  Last Error
                                </p>
                                <pre className="text-destructive/80 whitespace-pre-wrap font-mono text-[10px]">
                                  {entry.lastError}
                                </pre>
                              </div>
                            )}
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-muted-foreground mb-1 text-[11px] font-medium">
                                Payload
                              </p>
                              <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
                                {formatPayload(entry.payload)}
                              </pre>
                            </div>
                            {entry.responseBody && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-muted-foreground mb-1 text-[11px] font-medium">
                                  Response Body
                                </p>
                                <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
                                  {entry.responseBody}
                                </pre>
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <EmptyState
                    icon={AlertTriangle}
                    title="Select a webhook"
                    description="Click 'Dead letters' on any webhook to view its failed deliveries queue."
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Register a webhook</DialogTitle>
              <DialogDescription>
                Events are signed and delivered as HTTP POSTs. A secret is generated for you. Your
                endpoint should verify the X-Webhook-Signature header.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="hook-name">Name</Label>
                <Input
                  id="hook-name"
                  value={form.name}
                  onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                  placeholder="AICTE reporting endpoint"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook-url">Endpoint URL</Label>
                <Input
                  id="hook-url"
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm((c) => ({ ...c, url: event.target.value }))}
                  placeholder="https://example.gov.in/hooks/fdr-events"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Events (categorized)</Label>
                {Object.entries(EVENT_CATEGORIES).map(([category, events]) => (
                  <div key={category} className="space-y-1">
                    <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {events.map((event) => (
                        <button
                          key={event}
                          type="button"
                          onClick={() => toggleEvent(event)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                            form.events.includes(event)
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                          )}
                        >
                          {event}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {formError && (
                <p className="text-destructive text-[12px]" role="alert">
                  {formError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={createWebhook.isMutating || !form.name.trim() || !form.url.trim()}
              >
                {createWebhook.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
