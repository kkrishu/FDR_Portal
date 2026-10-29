'use client';

/**
 * Notifications.
 *
 * The full inbox behind the toolbar bell: filter by unread, mark one or all as
 * read, and follow the link to the record each message refers to.
 */

import * as React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { cn, formatDateTime } from '@/lib/utils';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  metadata?: { link?: string } | null;
}

export default function NotificationsPage() {
  const [page, setPage] = React.useState(1);
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const { data, meta, isLoading, refresh } = useApi<NotificationRow[]>([
    '/notifications',
    { page, limit: 20, ...(unreadOnly ? { unreadOnly: true } : {}) },
  ]);

  const markOne = useDynamicMutation('patch', {
    revalidate: ['/notifications'],
  });
  const markAll = useDynamicMutation('patch', {
    successMessage: 'All notifications marked as read',
    revalidate: ['/notifications'],
  });

  const notifications = data ?? [];
  const unreadCount = meta?.unreadCount ?? 0;

  const handleMarkOne = async (id: string) => {
    await markOne.run(`/notifications/${id}/read`).catch(() => undefined);
    await refresh();
  };

  const handleMarkAll = async () => {
    await markAll.run('/notifications/read-all').catch(() => undefined);
    await refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notifications"
          description="Every update on your deposits, newest first."
          actions={
            unreadCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkAll}
                disabled={markAll.isMutating}
              >
                {markAll.isMutating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="mr-1.5 h-4 w-4" />
                )}
                Mark all read
              </Button>
            ) : undefined
          }
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
              !unreadOnly
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
              unreadOnly
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        </div>

        <Card>
          <CardContent className="pt-2">
            {isLoading ? (
              <div className="space-y-4 py-3">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-4">
                <EmptyState
                  icon={Bell}
                  title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
                  description={
                    unreadOnly
                      ? 'You have read everything.'
                      : 'Workflow updates on your deposits will appear here.'
                  }
                  action={
                    unreadOnly ? (
                      <Button variant="outline" size="sm" onClick={() => setUnreadOnly(false)}>
                        Show all
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="divide-y">
                {notifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  return (
                    <li key={notification.id} className="relative flex gap-3 py-3.5 first:pt-2">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          isUnread ? 'bg-primary' : 'bg-transparent'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p
                            className={cn(
                              'text-[13px] leading-snug',
                              isUnread ? 'font-semibold' : 'font-medium'
                            )}
                          >
                            {notification.title}
                          </p>
                          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                            {formatDateTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-relaxed">
                          {notification.message}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3">
                          {notification.metadata?.link && (
                            <Link
                              href={notification.metadata.link}
                              onClick={() => isUnread && void handleMarkOne(notification.id)}
                              className="text-primary text-[11.5px] font-medium hover:underline"
                            >
                              View record
                            </Link>
                          )}
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => void handleMarkOne(notification.id)}
                              className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {meta?.totalPages && meta.totalPages > 1 && (
          <Pagination
            page={meta.page ?? page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={setPage}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
