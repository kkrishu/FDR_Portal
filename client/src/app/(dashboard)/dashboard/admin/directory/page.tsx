'use client';

/**
 * Bank directory.
 *
 * Every bank and branch AICTE works with, plus the create form. A new branch
 * starts unverified — the branch itself confirms its details before deposits
 * can be sent there.
 */

import * as React from 'react';
import { Banknote, Building, Loader2, Plus, Search } from 'lucide-react';
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
import { useApi, useApiMutation, getErrorMessage } from '@/lib/hooks/use-api';
import { cn, formatDate } from '@/lib/utils';

interface BranchRow {
  id: string;
  ifscCode: string;
  branchName: string;
  address: string;
  city: string;
  state: string;
  isVerified: boolean;
  verifiedAt: string | null;
  bank: { id: string; name: string; code: string };
}

const EMPTY_FORM = {
  ifscCode: '',
  bankName: '',
  branchName: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
};

export default function AdminDirectoryPage() {
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [verifiedFilter, setVerifiedFilter] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: banks, isLoading: loadingBanks } =
    useApi<Array<{ id: string; name: string; code: string }>>('/directory/banks');

  const { data, meta, isLoading, errorMessage } = useApi<BranchRow[]>([
    '/directory/branches',
    {
      page,
      limit: 12,
      ...(debounced ? { search: debounced } : {}),
      ...(verifiedFilter ? { isVerified: verifiedFilter } : {}),
    },
  ]);

  const createBranch = useApiMutation('/directory/branches', 'post', {
    successMessage: 'Branch added to the directory',
    revalidate: ['/directory/branches', '/directory/banks'],
    onSuccess: () => {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
  });

  const rows = data ?? [];

  const handleCreate = async () => {
    setFormError(null);
    try {
      await createBranch.run(form);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Bank directory"
          description="Banks and branches that verify deposits, with their verification state."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add branch
            </Button>
          }
        />

        {/* Bank summary strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loadingBanks
            ? [0, 1, 2].map((key) => (
                <Card key={key}>
                  <CardContent className="space-y-2 py-4">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </CardContent>
                </Card>
              ))
            : (banks ?? []).map((bank) => (
                <Card key={bank.id}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
                      <Banknote className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{bank.name}</p>
                      <p className="text-muted-foreground font-mono text-[10.5px]">{bank.code}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by IFSC, branch, or city…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {[
              { value: '', label: 'All' },
              { value: 'true', label: 'Verified' },
              { value: 'false', label: 'Unverified' },
            ].map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                onClick={() => {
                  setVerifiedFilter(filter.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                  verifiedFilter === filter.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-44" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Building}
                title="No branches found"
                description={
                  query ? `Nothing matches “${query}”.` : 'Add the first branch to the directory.'
                }
                action={
                  query ? (
                    <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                      Clear search
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b">
                      {['Branch', 'Bank', 'Location', 'Verification', ''].map((heading, index) => (
                        <th
                          key={index}
                          className="text-muted-foreground pb-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((branch, index) => (
                      <tr
                        key={branch.id}
                        className="animate-fade-in-up border-b last:border-0"
                        style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
                      >
                        <td className="py-3 pr-3">
                          <p className="font-mono text-[12px] font-semibold">{branch.ifscCode}</p>
                          <p className="text-muted-foreground text-[11.5px]">{branch.branchName}</p>
                        </td>
                        <td className="py-3 pr-3 text-[12.5px]">{branch.bank?.name ?? '—'}</td>
                        <td className="text-muted-foreground py-3 pr-3 text-[12px]">
                          {branch.city}, {branch.state}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={branch.isVerified ? 'ACTIVE' : 'PENDING'} />
                          {branch.verifiedAt && (
                            <p className="text-muted-foreground mt-0.5 text-[10.5px]">
                              {formatDate(branch.verifiedAt)}
                            </p>
                          )}
                        </td>
                        <td className="w-16" />
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a branch</DialogTitle>
            <DialogDescription>
              The bank must already exist in the directory; match its name exactly.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[55vh] gap-3.5 overflow-y-auto py-1 pr-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-ifsc">IFSC code</Label>
              <Input
                id="branch-ifsc"
                value={form.ifscCode}
                onChange={(event) =>
                  setForm((c) => ({ ...c, ifscCode: event.target.value.toUpperCase() }))
                }
                placeholder="SBIN0001234"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-bank">Bank name</Label>
              <Input
                id="branch-bank"
                value={form.bankName}
                onChange={(event) => setForm((c) => ({ ...c, bankName: event.target.value }))}
                list="bank-names"
              />
              <datalist id="bank-names">
                {(banks ?? []).map((bank) => (
                  <option key={bank.id} value={bank.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="branch-name">Branch name</Label>
              <Input
                id="branch-name"
                value={form.branchName}
                onChange={(event) => setForm((c) => ({ ...c, branchName: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="branch-address">Address</Label>
              <Input
                id="branch-address"
                value={form.address}
                onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-city">City</Label>
              <Input
                id="branch-city"
                value={form.city}
                onChange={(event) => setForm((c) => ({ ...c, city: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-state">State</Label>
              <Input
                id="branch-state"
                value={form.state}
                onChange={(event) => setForm((c) => ({ ...c, state: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-pincode">PIN code</Label>
              <Input
                id="branch-pincode"
                value={form.pincode}
                onChange={(event) => setForm((c) => ({ ...c, pincode: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-contact">Contact person</Label>
              <Input
                id="branch-contact"
                value={form.contactPerson}
                onChange={(event) => setForm((c) => ({ ...c, contactPerson: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-email">Contact email</Label>
              <Input
                id="branch-email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm((c) => ({ ...c, contactEmail: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-phone">Contact phone</Label>
              <Input
                id="branch-phone"
                value={form.contactPhone}
                onChange={(event) => setForm((c) => ({ ...c, contactPhone: event.target.value }))}
              />
            </div>
            {formError && (
              <p className="text-destructive text-[12px] sm:col-span-2" role="alert">
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
                createBranch.isMutating ||
                !form.ifscCode.trim() ||
                !form.bankName.trim() ||
                !form.branchName.trim() ||
                !form.city.trim()
              }
            >
              {createBranch.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Add branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
