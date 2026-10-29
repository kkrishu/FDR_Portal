'use client';

/**
 * Webhooks.
 *
 * Outgoing event subscriptions with delivery history. Creating one registers
 * the URL; sending a test event confirms the endpoint is reachable before a
 * real workflow depends on it.
 */

import * as React from 'react';
import { Activity, Loader2, Plus, Send, Trash2, Webhook } from 'lucide-react';
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
import { useApi, useApiMutation, useDynamicMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { formatDateTime } from '@/lib/utils';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  _count?: { deliveries: number };
}

const AVAILABLE_EVENTS = [
  'fdr.submitted',
  'fdr.verified',
  'fdr.flagged',
  'release.requested',
  'release.approved',
];

const EMPTY_FORM = { name: '', url: '', events: ['fdr.submitted'] as string[] };

export default function AdminWebhooksPage() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

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

  const rows = data ?? [];

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

  const toggleEvent = (event: string) => {
    setForm((current) => ({
      ...current,
      events: current.events.includes(event)
        ? current.events.filter((item) => item !== event)
        : [...current.events, event],
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Webhooks"
          description="HTTP endpoints that receive portal events as they happen."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New webhook
            </Button>
          }
        />

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
                  <div className="flex flex-wrap items-center gap-1.5">
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
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register a webhook</DialogTitle>
            <DialogDescription>
              Events are signed and delivered as HTTP POSTs. A secret is generated for you.
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
              <Label className="text-[12px]">Events</Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_EVENTS.map((event) => (
                  <button
                    key={event}
                    type="button"
                    onClick={() => toggleEvent(event)}
                    className={
                      form.events.includes(event)
                        ? 'border-primary bg-primary text-primary-foreground rounded-full border px-2.5 py-1 font-mono text-[11px]'
                        : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors'
                    }
                  >
                    {event}
                  </button>
                ))}
              </div>
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
    </DashboardLayout>
  );
}
