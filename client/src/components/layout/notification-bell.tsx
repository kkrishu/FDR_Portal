'use client';

/**
 * Notification bell.
 *
 * Reads real rows from `GET /notifications`. The badge only appears when
 * something is unread, opening the popover marks the list seen, and each entry
 * links to the record it refers to. Marking read goes through the API so the
 * count survives a reload.
 */

import * as React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  metadata?: { link?: string; fdrNumber?: string; fdrId?: string } | null;
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(
    new Date(value)
  );
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);

  const { data, meta, isLoading, refresh } = useApi<NotificationRow[]>([
    '/notifications',
    { limit: 12 },
  ]);

  const unreadCount = meta?.unreadCount ?? 0;
  const notifications = data ?? [];

  const markOne = useDynamicMutation('patch', {
    errorMessage: 'Could not mark that as read',
    revalidate: ['/notifications', '/notifications/unread-count'],
  });

  const markAll = useDynamicMutation('patch', {
    successMessage: 'All notifications marked as read',
    revalidate: ['/notifications', '/notifications/unread-count'],
  });

  const handleMarkOne = async (id: string) => {
    await markOne.run(`/notifications/${id}/read`).catch(() => undefined);
    await refresh();
  };

  const handleMarkAll = async () => {
    await markAll.run('/notifications/read-all').catch(() => undefined);
    await refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground relative h-9 w-9"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="bg-destructive absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-1.5rem)] p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-muted-foreground text-[11px]">
              {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={handleMarkAll}
              disabled={markAll.isMutating}
            >
              {markAll.isMutating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[380px]">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {[0, 1, 2].map((key) => (
                <div key={key} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-3">
              <EmptyState
                compact
                icon={Bell}
                title="No notifications yet"
                description="Activity on your deposits will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const link = notification.metadata?.link;
                const isUnread = !notification.readAt;

                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-[13px] leading-snug',
                          isUnread ? 'font-semibold' : 'text-muted-foreground font-medium'
                        )}
                      >
                        {notification.title}
                      </p>
                      <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[12px] leading-relaxed">
                      {notification.message}
                    </p>
                  </>
                );

                return (
                  <li key={notification.id} className="relative">
                    {isUnread && (
                      <span className="bg-primary absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" />
                    )}
                    {link ? (
                      <Link
                        href={link}
                        onClick={() => {
                          setOpen(false);
                          if (isUnread) void handleMarkOne(notification.id);
                        }}
                        className="hover:bg-accent/60 block px-4 py-3 pl-5 transition-colors"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => isUnread && void handleMarkOne(notification.id)}
                        className="hover:bg-accent/60 block w-full px-4 py-3 pl-5 text-left transition-colors"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-xs">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
