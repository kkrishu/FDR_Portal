'use client';

/**
 * Institutions.
 *
 * The full register of participating institutions, with the create form behind
 * a dialog. Editing reuses the same endpoint the profile page uses.
 */

import * as React from 'react';
import { Building2, Loader2, Plus, Search } from 'lucide-react';
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
import { formatDate } from '@/lib/utils';

interface InstitutionRow {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  _count?: { users: number; fdrs: number };
}

const EMPTY_FORM = {
  name: '',
  code: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
};

export default function AdminInstitutionsPage() {
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
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

  const { data, meta, isLoading, errorMessage } = useApi<InstitutionRow[]>([
    '/institutions',
    { page, limit: 12, ...(debounced ? { search: debounced } : {}) },
  ]);

  const createInstitution = useApiMutation('/institutions', 'post', {
    successMessage: 'Institution registered',
    revalidate: ['/institutions', '/dashboard/summary'],
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
      await createInstitution.run(form);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Institutions"
          description="Every institution registered to hold deposits with AICTE."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Register institution
            </Button>
          }
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="relative max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name, code, or city…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-2.5 py-5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-4">
              <EmptyState
                icon={Building2}
                title="No institutions found"
                description={
                  query
                    ? `Nothing matches “${query}”.`
                    : 'Register the first institution to get started.'
                }
                action={
                  query ? (
                    <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                      Clear search
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Register institution
                    </Button>
                  )
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((institution, index) => (
              <Card
                key={institution.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
              >
                <CardContent className="space-y-3 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold">{institution.name}</p>
                      <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                        {institution.code}
                      </p>
                    </div>
                    <StatusBadge status={institution.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </div>

                  <div className="text-muted-foreground space-y-0.5 text-[11.5px]">
                    <p className="truncate">
                      {institution.city}, {institution.state}
                    </p>
                    <p className="truncate">{institution.email}</p>
                  </div>

                  <div className="border-t pt-2.5 text-[11.5px]">
                    {institution._count ? (
                      <p className="text-muted-foreground">
                        {institution._count.fdrs} deposits · {institution._count.users} users
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Registered {formatDate(institution.createdAt)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register an institution</DialogTitle>
            <DialogDescription>
              The AICTE code must be unique — it identifies the institution on every deposit.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[55vh] gap-3.5 overflow-y-auto py-1 pr-1 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inst-name">Institution name</Label>
              <Input
                id="inst-name"
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-code">AICTE code</Label>
              <Input
                id="inst-code"
                value={form.code}
                onChange={(event) =>
                  setForm((c) => ({ ...c, code: event.target.value.toUpperCase() }))
                }
                placeholder="AICTE-INST-004"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-phone">Phone</Label>
              <Input
                id="inst-phone"
                value={form.phone}
                onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inst-address">Address</Label>
              <Input
                id="inst-address"
                value={form.address}
                onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-city">City</Label>
              <Input
                id="inst-city"
                value={form.city}
                onChange={(event) => setForm((c) => ({ ...c, city: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-state">State</Label>
              <Input
                id="inst-state"
                value={form.state}
                onChange={(event) => setForm((c) => ({ ...c, state: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-pincode">PIN code</Label>
              <Input
                id="inst-pincode"
                value={form.pincode}
                onChange={(event) => setForm((c) => ({ ...c, pincode: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-email">Email</Label>
              <Input
                id="inst-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
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
                createInstitution.isMutating ||
                !form.name.trim() ||
                !form.code.trim() ||
                !form.city.trim() ||
                !form.email.trim()
              }
            >
              {createInstitution.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
