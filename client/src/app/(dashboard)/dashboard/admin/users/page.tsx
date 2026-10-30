'use client';

/**
 * User management.
 *
 * Create, edit, and delete accounts in any role — this is the only place an
 * ADMIN can be minted, since public sign-up refuses that role.
 */

import * as React from 'react';
import {
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Edit2,
  Trash2,
  AlertTriangle,
  Eye,
  FileText,
  Bell,
  History,
  Building2,
  CreditCard,
  Archive,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Shield,
  User,
  Key,
  Activity,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useApi, useApiMutation, useDynamicMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface UserDetail extends UserRow {
  updatedAt?: string;
  institution?: {
    id: string;
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    website: string | null;
    isActive: boolean;
    createdAt: string;
  } | null;
  bank?: {
    id: string;
    name: string;
    code: string;
    logoUrl: string | null;
    isActive: boolean;
    createdAt: string;
    branches: Array<{
      id: string;
      ifscCode: string;
      branchName: string;
      address: string;
      city: string;
      state: string;
      isVerified: boolean;
    }>;
  } | null;
  fdrStats?: {
    total: number;
    byStatus: Record<string, number>;
  };
  recentFDRs?: Array<{
    id: string;
    fdrNumber: string;
    bankName: string;
    branchName: string;
    amount: number;
    status: string;
    issueDate: string;
    maturityDate: string;
    riskScore: number;
    createdAt: string;
  }>;
  notifications?: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    channels: string[];
    readAt: string | null;
    createdAt: string;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorName: string;
    createdAt: string;
  }>;
  refreshTokens?: Array<{
    id: string;
    expiresAt: string;
    revoked: boolean;
    createdAt: string;
  }>;
}

const ROLES = [
  { value: 'INSTITUTION', label: 'Institution' },
  { value: 'OFFICER', label: 'Reviewing Officer' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'BANK_MANAGER', label: 'Bank Manager' },
  { value: 'NODAL_OFFICER', label: 'Nodal Officer' },
  { value: 'AUDITOR', label: 'Auditor' },
] as const;

const STATUS_FILTERS = ['All', 'ACTIVE', 'INACTIVE'] as const;
const ROLE_FILTERS = [
  'All',
  'INSTITUTION',
  'OFFICER',
  'ADMIN',
  'BANK_MANAGER',
  'NODAL_OFFICER',
  'AUDITOR',
] as const;

export default function AdminUsersPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = React.useState<UserRow | null>(null);
  const [viewingUser, setViewingUser] = React.useState<UserDetail | null>(null);
  const [viewLoading, setViewLoading] = React.useState(false);

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: 'INSTITUTION',
    status: 'ACTIVE',
    institutionId: '',
    bankId: '',
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
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(debounced ? { search: debounced } : {}),
    },
  ]);

  const createUser = useApiMutation('/users', 'post', {
    successMessage: 'Account created',
    revalidate: ['/users', '/dashboard/summary'],
    onSuccess: () => {
      setCreateOpen(false);
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'INSTITUTION',
        status: 'ACTIVE',
        institutionId: '',
        bankId: '',
      });
      setFormError(null);
    },
  });

  const updateUser = useDynamicMutation('put', {
    successMessage: 'User updated',
    revalidate: ['/users'],
    onSuccess: () => {
      setEditOpen(false);
      setEditingUser(null);
      setFormError(null);
    },
  });

  const deleteUser = useDynamicMutation('delete', {
    successMessage: 'User deleted',
    revalidate: ['/users'],
    onSuccess: () => {
      setDeleteOpen(false);
      setDeletingUser(null);
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
      toast.success('Account created successfully');
    } catch (error) {
      setFormError(getErrorMessage(error));
      toast.error('Failed to create account', { description: getErrorMessage(error) });
    }
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    setFormError(null);
    try {
      // For PUT, we need to send all fields
      const updateData = { ...form };
      // Don't send empty password
      if (!updateData.password) {
        // @ts-expect-error - password is required in form state but optional in API
        delete updateData.password;
      }
      await updateUser.run(`/users/${editingUser.id}`, updateData);
      toast.success('User updated successfully');
    } catch (error) {
      setFormError(getErrorMessage(error));
      toast.error('Failed to update user', { description: getErrorMessage(error) });
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      // Use hard delete endpoint
      await deleteUser.run(`/users/${deletingUser.id}/hard`, {});
      toast.success('User permanently deleted');
    } catch (error) {
      toast.error('Failed to delete user', { description: getErrorMessage(error) });
    }
  };

  const openEditDialog = (user: UserRow) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '', // Don't pre-fill password
      role: user.role,
      status: user.status,
      institutionId: user.institutionId || '',
      bankId: user.bankId || '',
    });
    setFormError(null);
    setEditOpen(true);
  };

  const openDeleteDialog = (user: UserRow) => {
    // Prevent deleting yourself
    // The current user ID would need to come from auth context
    setDeletingUser(user);
    setDeleteOpen(true);
  };

  const openViewDialog = async (user: UserRow) => {
    setViewLoading(true);
    setViewingUser(null);
    setViewOpen(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/users/${user.id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('fdr-portal-access-token')}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (response.ok) {
        const result = await response.json();
        setViewingUser(result.data);
      } else {
        throw new Error('Failed to fetch');
      }
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      toast.error('Failed to load user details');
    } finally {
      setViewLoading(false);
    }
  };

  const toggleStatus = async (user: UserRow) => {
    const next = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await setUserStatus.run(`/users/${user.id}`, { status: next }).catch(() => undefined);
    await refresh();
    toast.success(`User ${next.toLowerCase()}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description="Manage all accounts in the portal. Administrators can only be created or edited here."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setForm({
                  name: '',
                  email: '',
                  password: '',
                  role: 'INSTITUTION',
                  status: 'ACTIVE',
                  institutionId: '',
                  bankId: '',
                });
                setFormError(null);
                setCreateOpen(true);
              }}
            >
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
              <div className="flex flex-wrap gap-1.5">
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
                {ROLE_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setRoleFilter(filter === 'All' ? '' : filter);
                      setPage(1);
                    }}
                    className={
                      roleFilter === (filter === 'All' ? '' : filter)
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
                description="Try a different search, or clear the filters."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="border-b">
                      {['User', 'Role', 'Status', 'MFA', 'Last sign-in', 'Created', ''].map(
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
                        <td className="text-muted-foreground py-3 pr-3 text-[11.5px]">
                          {formatDateTime(user.createdAt).split(' ')[0]}
                        </td>
                        <td className="py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions for {user.name}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                <Edit2 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openViewDialog(user)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(user)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
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

      {/* Create/Edit Dialog */}
      <Dialog
        open={createOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditOpen(false);
            setEditingUser(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{createOpen ? 'Create a user' : 'Edit user'}</DialogTitle>
            <DialogDescription>
              {createOpen
                ? 'Administrator accounts can only be created here — public sign-up refuses that role.'
                : 'Update user details. Leave password blank to keep current password.'}
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
            {editOpen && (
              <div className="space-y-1.5">
                <Label htmlFor="user-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
                >
                  <SelectTrigger id="user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="user-password">
                {editOpen ? 'New password (optional)' : 'Temporary password'}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={
                  editOpen
                    ? 'Leave blank to keep current'
                    : 'At least 8 characters, mixed case, number, symbol'
                }
              />
              {editOpen && (
                <p className="text-muted-foreground text-xs">
                  Leave blank to keep current password
                </p>
              )}
            </div>
            {formError && (
              <p className="text-destructive text-[12px]" role="alert">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditOpen(false);
                setEditingUser(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={createOpen ? () => void handleCreate() : () => void handleEdit()}
              disabled={
                (createOpen ? createUser.isMutating : updateUser.isMutating) ||
                !form.name.trim() ||
                !form.email.trim() ||
                (createOpen && form.password.length < 8)
              }
            >
              {(createOpen ? createUser.isMutating : updateUser.isMutating) && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {createOpen ? 'Create user' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete user
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deletingUser?.name}</strong> (
              {deletingUser?.email})? This action cannot be undone and will remove all associated
              data.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteUser.isMutating}
            >
              {deleteUser.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="text-primary h-5 w-5" />
              User Details
            </DialogTitle>
            <DialogDescription>
              Complete profile and activity overview for {viewingUser?.name}
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
            </div>
          ) : viewingUser ? (
            <div className="space-y-4">
              {/* User Header */}
              <div className="bg-muted/50 flex items-center gap-4 rounded-xl p-4">
                <div className="bg-primary/10 text-primary flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold">
                  {viewingUser.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-semibold">{viewingUser.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {ROLES.find((r) => r.value === viewingUser.role)?.label ?? viewingUser.role}
                    </Badge>
                    <StatusBadge status={viewingUser.status} />
                    {viewingUser.mfaEnabled && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        MFA Enabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-sm">{viewingUser.email}</p>
                </div>
                <div className="text-muted-foreground text-right text-sm">
                  <p>Created: {formatDateTime(viewingUser.createdAt).split(' ')[0]}</p>
                  <p>
                    Last login:{' '}
                    {viewingUser.lastLoginAt ? formatDateTime(viewingUser.lastLoginAt) : 'Never'}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="fdrs">FDRs ({viewingUser.fdrStats?.total ?? 0})</TabsTrigger>
                  <TabsTrigger value="institution">Institution</TabsTrigger>
                  <TabsTrigger value="bank">Bank</TabsTrigger>
                  <TabsTrigger value="notifications">
                    Notifications ({viewingUser.notifications?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="audit">
                    Audit Log ({viewingUser.auditLogs?.length ?? 0})
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{viewingUser.fdrStats?.total ?? 0}</p>
                            <p className="text-muted-foreground text-xs">Total FDRs</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {viewingUser.fdrStats?.byStatus?.VERIFIED ?? 0}
                            </p>
                            <p className="text-muted-foreground text-xs">Verified</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
                            <Clock className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {viewingUser.fdrStats?.byStatus?.SUBMITTED ?? 0}
                            </p>
                            <p className="text-muted-foreground text-xs">Pending</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-red-100 p-2 text-red-600">
                            <AlertCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {viewingUser.fdrStats?.byStatus?.FLAGGED ?? 0}
                            </p>
                            <p className="text-muted-foreground text-xs">Flagged</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recent FDRs */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="font-medium">Recent FDRs</h4>
                        {viewingUser.recentFDRs && viewingUser.recentFDRs.length > 0 && (
                          <span className="text-muted-foreground text-xs">
                            Showing {viewingUser.recentFDRs.length} of{' '}
                            {viewingUser.fdrStats?.total ?? 0}
                          </span>
                        )}
                      </div>
                      {viewingUser.recentFDRs && viewingUser.recentFDRs.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-muted-foreground border-b">
                                <th className="pb-2 text-left">FDR Number</th>
                                <th className="pb-2 text-left">Bank</th>
                                <th className="pb-2 text-right">Amount</th>
                                <th className="pb-2 text-left">Status</th>
                                <th className="pb-2 text-left">Maturity</th>
                                <th className="pb-2 text-center">Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewingUser.recentFDRs.map((fdr) => (
                                <tr key={fdr.id} className="border-b last:border-0">
                                  <td className="py-2 font-mono">{fdr.fdrNumber}</td>
                                  <td className="py-2">{fdr.bankName}</td>
                                  <td className="py-2 text-right">
                                    ₹{fdr.amount.toLocaleString()}
                                  </td>
                                  <td className="py-2">
                                    <StatusBadge status={fdr.status} />
                                  </td>
                                  <td className="py-2">
                                    {formatDateTime(fdr.maturityDate).split(' ')[0]}
                                  </td>
                                  <td className="py-2 text-center">
                                    <Badge
                                      variant={
                                        fdr.riskScore > 50
                                          ? 'destructive'
                                          : fdr.riskScore > 25
                                            ? 'secondary'
                                            : 'outline'
                                      }
                                    >
                                      {fdr.riskScore}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-muted-foreground py-4 text-center">No FDRs found</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* FDRs Tab */}
                <TabsContent value="fdrs" className="space-y-4">
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="mb-4 font-medium">FDR Status Distribution</h4>
                      {viewingUser.fdrStats?.byStatus &&
                      Object.keys(viewingUser.fdrStats.byStatus).length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                          {Object.entries(viewingUser.fdrStats.byStatus).map(([status, count]) => (
                            <Card key={status}>
                              <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold">{count}</p>
                                <p className="text-muted-foreground text-xs capitalize">
                                  {status.toLowerCase().replace(/_/g, ' ')}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground py-4 text-center">No FDR data</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Institution Tab */}
                <TabsContent value="institution" className="space-y-4">
                  {viewingUser.institution ? (
                    <>
                      <Card>
                        <CardContent className="p-4">
                          <div className="mb-4 flex items-center justify-between">
                            <h4 className="font-medium">Institution Profile</h4>
                            <Badge
                              variant={viewingUser.institution.isActive ? 'default' : 'destructive'}
                            >
                              {viewingUser.institution.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">AICTE Code</p>
                              <p className="font-mono">{viewingUser.institution.code}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">Name</p>
                              <p>{viewingUser.institution.name}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">Address</p>
                              <p>
                                {viewingUser.institution.address}, {viewingUser.institution.city},{' '}
                                {viewingUser.institution.state} - {viewingUser.institution.pincode}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">Contact</p>
                              <p>
                                {viewingUser.institution.phone} / {viewingUser.institution.email}
                              </p>
                            </div>
                            {viewingUser.institution.website && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-xs">Website</p>
                                <p>
                                  <a
                                    href={viewingUser.institution.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    {viewingUser.institution.website}
                                  </a>
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <Building2 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                        <p className="text-muted-foreground">No institution linked</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Bank Tab */}
                <TabsContent value="bank" className="space-y-4">
                  {viewingUser.bank ? (
                    <>
                      <Card>
                        <CardContent className="p-4">
                          <div className="mb-4 flex items-center justify-between">
                            <h4 className="font-medium">Bank Details</h4>
                            <Badge variant={viewingUser.bank.isActive ? 'default' : 'destructive'}>
                              {viewingUser.bank.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="mb-6 grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">Bank Code</p>
                              <p className="font-mono">{viewingUser.bank.code}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">Bank Name</p>
                              <p>{viewingUser.bank.name}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {viewingUser.bank.branches && viewingUser.bank.branches.length > 0 && (
                        <Card>
                          <CardContent className="p-4">
                            <h4 className="mb-4 font-medium">
                              Branches ({viewingUser.bank.branches.length})
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-muted-foreground border-b">
                                    <th className="pb-2 text-left">Branch</th>
                                    <th className="pb-2 text-left">IFSC</th>
                                    <th className="pb-2 text-left">Location</th>
                                    <th className="pb-2 text-center">Verified</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {viewingUser.bank.branches.map((branch) => (
                                    <tr key={branch.id} className="border-b last:border-0">
                                      <td className="py-2">{branch.branchName}</td>
                                      <td className="py-2 font-mono">{branch.ifscCode}</td>
                                      <td className="py-2">
                                        {branch.address}, {branch.city}, {branch.state}
                                      </td>
                                      <td className="py-2 text-center">
                                        <Badge
                                          variant={branch.isVerified ? 'default' : 'secondary'}
                                        >
                                          {branch.isVerified ? 'Verified' : 'Not Verified'}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <CreditCard className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                        <p className="text-muted-foreground">No bank linked</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Notifications Tab */}
                <TabsContent value="notifications" className="space-y-4">
                  {viewingUser.notifications && viewingUser.notifications.length > 0 ? (
                    <Card>
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {viewingUser.notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3"
                            >
                              <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                                <Bell className="text-primary h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h5 className="font-medium">{notif.title}</h5>
                                  <Badge variant="outline" className="text-xs">
                                    {notif.type}
                                  </Badge>
                                  {!notif.readAt && (
                                    <Badge variant="default" className="text-xs">
                                      Unread
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                                  {notif.message}
                                </p>
                                <p className="text-muted-foreground mt-2 text-xs">
                                  {formatDateTime(notif.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <Bell className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                        <p className="text-muted-foreground">No notifications</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Audit Log Tab */}
                <TabsContent value="audit" className="space-y-4">
                  {viewingUser.auditLogs && viewingUser.auditLogs.length > 0 ? (
                    <Card>
                      <CardContent className="p-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-muted-foreground border-b">
                                <th className="pb-2 text-left">Action</th>
                                <th className="pb-2 text-left">Entity</th>
                                <th className="pb-2 text-left">Entity ID</th>
                                <th className="pb-2 text-left">Actor</th>
                                <th className="pb-2 text-left">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewingUser.auditLogs.map((log) => (
                                <tr key={log.id} className="border-b last:border-0">
                                  <td className="py-2 font-mono text-xs">{log.action}</td>
                                  <td className="py-2">{log.entityType}</td>
                                  <td className="py-2 font-mono text-xs">
                                    {log.entityId.slice(0, 12)}...
                                  </td>
                                  <td className="py-2">{log.actorName}</td>
                                  <td className="py-2">{formatDateTime(log.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <History className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                        <p className="text-muted-foreground">No audit logs</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-muted-foreground">No user selected</p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setViewOpen(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              setEditOpen(true);
              setViewOpen(false);
              setEditingUser(viewingUser ? { ...viewingUser } : null);
            }}
          >
            <Edit2 className="mr-1.5 h-4 w-4" />
            Edit User
          </Button>
        </DialogFooter>
      </Dialog>
    </DashboardLayout>
  );
}
