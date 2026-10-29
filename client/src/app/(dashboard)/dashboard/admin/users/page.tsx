'use client';

/**
 * User management.
 *
 * Create accounts in any role — this is the only place an ADMIN can be minted,
 * since public sign-up refuses that role — and deactivate or reactivate them.
 */

import * as React from 'react';
import { Loader2, MoreHorizontal, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi, useApiMutation, useDynamicMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { formatDateTime } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  institutionId: string | null;
  bankId: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = [
  { value: 'INSTITUTION', label: 'Institution' },
  { value: 'OFFICER', label: 'Reviewing Officer' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'BANK_MANAGER', label: 'Bank Manager' },
  { value: 'NODAL_OFFICER', label: 'Nodal Officer' },
  { value: 'AUDITOR', label: 'Auditor' },
];

const STATUS_FILTERS = ['All', 'ACTIVE', 'INACTIVE'] as const;

export default function AdminUsersPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: 'INSTITUTION',
  });
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, meta, isLoading, errorMessage, refresh } = useApi<UserRow[]>([
    '/users',
    {
      page,
      limit: 10,
      ...(status ? { status } : {}),
      ...(debounced ? { search: debounced } : {}),
    },
  ]);

  const createUser = useApiMutation('/users', 'post', {
    successMessage: 'Account created',
    revalidate: ['/users', '/dashboard/summary'],
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: '', email: '', password: '', role: 'INSTITUTION' });
      setFormError(null);
    },
  });

  const setUserStatus = useDynamicMutation('patch', {
    revalidate: ['/users'],
  });
  const resetMfa = useDynamicMutation('post', {
    successMessage: 'MFA reset',
    revalidate: ['/users'],
  });

  const rows = data ?? [];

  const handleCreate = async () => {
    setFormError(null);
    try {
      await createUser.run(form);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const toggleStatus = async (user: UserRow) => {
    const next = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await setUserStatus.run(`/users/${user.id}`, { status: next }).catch(() => undefined);
    await refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description="Every account in the portal. Administrators can only be created here."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              New user
            </Button>
          }
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search name or email…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1.5">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setStatus(filter === 'All' ? '' : filter);
                      setPage(1);
                    }}
                    className={
                      status === (filter === 'All' ? '' : filter)
                        ? 'border-primary bg-primary text-primary-foreground rounded-full border px-2.5 py-1 text-[11.5px] font-medium'
                        : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors'
                    }
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No users match"
                description="Try a different search, or clear the status filter."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="border-b">
                      {['User', 'Role', 'Status', 'MFA', 'Last sign-in', ''].map(
                        (heading, index) => (
                          <th
                            key={index}
                            className="text-muted-foreground pb-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em]"
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((user, index) => (
                      <tr
                        key={user.id}
                        className="animate-fade-in-up group border-b last:border-0"
                        style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                              {user.name.slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-medium">{user.name}</p>
                              <p className="text-muted-foreground truncate text-[11px]">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-[12.5px]">
                          {ROLES.find((role) => role.value === user.role)?.label ?? user.role}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={user.status} />
                        </td>
                        <td className="py-3 pr-3">
                          {user.mfaEnabled ? (
                            <span className="flex items-center gap-1 text-[11.5px] text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              On
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11.5px]">Off</span>
                          )}
                        </td>
                        <td className="text-muted-foreground py-3 pr-3 text-[11.5px]">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                        </td>
                        <td className="py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions for {user.name}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => void toggleStatus(user)}>
                                {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                              </DropdownMenuItem>
                              {user.mfaEnabled && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void resetMfa.run(`/users/${user.id}/reset-mfa`, {})
                                    }
                                  >
                                    Reset MFA
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {meta?.totalPages && meta.totalPages > 1 && (
              <Pagination
                page={meta.page ?? page}
                totalPages={meta.totalPages}
                total={meta.total}
                limit={meta.limit}
                onPageChange={setPage}
                className="border-t pt-4"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
            <DialogDescription>
              Administrator accounts can only be created here — public sign-up refuses that role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Priya Sharma"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="user@organisation.gov.in"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}
              >
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Temporary password</Label>
              <Input
                id="user-password"
                type="text"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="At least 8 characters, mixed case, number, symbol"
              />
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
              disabled={
                createUser.isMutating ||
                !form.name.trim() ||
                !form.email.trim() ||
                form.password.length < 8
              }
            >
              {createUser.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
