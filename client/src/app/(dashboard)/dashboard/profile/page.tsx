'use client';

/**
 * Profile.
 *
 * Everyone has an account here. Institution users additionally see and edit
 * their institution's record; officer, bank, auditor and admin accounts show
 * their organisation instead, because they have no institution profile of
 * their own.
 */

import * as React from 'react';
import Image from 'next/image';
import { Building2, Camera, Check, Loader2, Mail, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi, useApiMutation, getFieldErrors } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/lib/auth';
import { ROLE_LABEL } from '@/config/navigation';
import { formatDate } from '@/lib/utils';
import type { UserRole } from '@fdr-portal/shared';

interface InstitutionProfile {
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
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { users: number; fdrs: number };
}

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;
  const isInstitution = role === 'INSTITUTION' && Boolean(user?.institutionId);

  // Name and avatar belong to the account itself; the institution block below
  // only applies to institution accounts.
  const [name, setName] = React.useState(user?.name ?? '');
  const [nameDirty, setNameDirty] = React.useState(false);
  const [savingName, setSavingName] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setName(user?.name ?? '');
    setNameDirty(false);
  }, [user?.name]);

  const saveName = async () => {
    if (name.trim().length < 2) return;
    setSavingName(true);
    try {
      const response: any = await api.patch('/auth/me', { name: name.trim() });
      setUser({ ...user, name: response?.data?.user?.name } as any);
      toast.success('Name updated');
      setNameDirty(false);
    } catch (error) {
      toast.error('Could not update your name', { description: getErrorMessage(error) });
    } finally {
      setSavingName(false);
    }
  };

  /** Uploads to Cloudinary through POST /uploads, then saved on the account. */
  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const uploaded: any = await api.upload('/uploads', file);
      const url = uploaded?.data?.fileUrl;
      if (!url) throw new Error('The upload did not return a file URL');
      const response: any = await api.patch('/auth/me', { avatarUrl: url });
      setUser({ ...user, avatarUrl: response?.data?.user?.avatarUrl } as any);
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error('Could not update your photo', { description: getErrorMessage(error) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const {
    data: institution,
    isLoading,
    refresh,
  } = useApi<InstitutionProfile>(
    isInstitution ? `/institutions/${user?.institutionId}/profile` : null
  );

  const [form, setForm] = React.useState<Partial<InstitutionProfile>>({});
  const [dirty, setDirty] = React.useState(false);

  // Adopt the server values once, then let the user edit freely.
  React.useEffect(() => {
    if (institution) {
      setForm({
        name: institution.name,
        address: institution.address,
        city: institution.city,
        state: institution.state,
        pincode: institution.pincode,
        phone: institution.phone,
        email: institution.email,
        website: institution.website ?? '',
        contactPerson: institution.contactPerson ?? '',
        contactPhone: institution.contactPhone ?? '',
        contactEmail: institution.contactEmail ?? '',
      });
      setDirty(false);
    }
  }, [institution]);

  const save = useApiMutation(`/institutions/${user?.institutionId}/profile`, 'patch', {
    successMessage: 'Profile updated',
    revalidate: [`/institutions/${user?.institutionId}/profile`],
    onSuccess: () => {
      setDirty(false);
      void refresh();
    },
    onError: (error) => {
      const fieldErrors = getFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        // Surface the first server-side reason inline rather than only a toast.
        setFieldError(`${Object.keys(fieldErrors)[0]}: ${Object.values(fieldErrors)[0]}`);
      }
    },
  });

  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const update = (key: keyof InstitutionProfile, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setFieldError(null);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Profile"
          description="Your account details, and the organisation you act for."
        />

        {/* Account card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <User className="h-4 w-4" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            {/* Avatar and name are the user's own fields, editable here. */}
            <div className="flex items-center gap-4">
              <div className="relative">
                {user?.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="border-border/70 h-16 w-16 rounded-full border object-cover"
                  />
                ) : (
                  <span className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold">
                    {getInitials(user?.name ?? '')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="bg-background border-border/70 text-muted-foreground hover:text-foreground absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors disabled:opacity-60"
                  aria-label="Upload profile photo"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAvatar(file);
                    event.target.value = '';
                  }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="profile-name"
                  className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide"
                >
                  Full name
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameDirty(true);
                    }}
                    className="h-9 max-w-xs"
                  />
                  {nameDirty && (
                    <Button
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => void saveName()}
                      disabled={savingName || name.trim().length < 2}
                    >
                      {savingName ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span className="sr-only">Save name</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnly label="Email" value={user?.email ?? '—'} icon={Mail} />
              <div>
                <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Role
                </p>
                <p className="mt-0.5 text-[13px] font-medium">{ROLE_LABEL[role] ?? role}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Account status
                </p>
                <div className="mt-1">
                  <StatusBadge status="ACTIVE" />
                </div>
              </div>
            </div>

            <Separator />
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Your email address and sign-in password are managed in{' '}
              <a href="/dashboard/settings" className="text-primary font-medium hover:underline">
                Settings
              </a>
              .
            </p>
          </CardContent>
        </Card>

        {/* Organisation card */}
        {isInstitution ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <Building2 className="h-4 w-4" />
                Institution
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading || !institution ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((key) => (
                    <Skeleton key={key} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save.run(form).catch(() => undefined);
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="name"
                      label="Institution name"
                      value={form.name ?? ''}
                      onChange={(value) => update('name', value)}
                    />
                    <ReadOnly label="AICTE code" value={institution.code} mono />
                    <Field
                      id="email"
                      label="Email"
                      type="email"
                      value={form.email ?? ''}
                      onChange={(value) => update('email', value)}
                    />
                    <Field
                      id="phone"
                      label="Phone"
                      value={form.phone ?? ''}
                      onChange={(value) => update('phone', value)}
                    />
                    <Field
                      id="address"
                      label="Address"
                      value={form.address ?? ''}
                      onChange={(value) => update('address', value)}
                      className="sm:col-span-2"
                    />
                    <Field
                      id="city"
                      label="City"
                      value={form.city ?? ''}
                      onChange={(value) => update('city', value)}
                    />
                    <Field
                      id="state"
                      label="State"
                      value={form.state ?? ''}
                      onChange={(value) => update('state', value)}
                    />
                    <Field
                      id="pincode"
                      label="PIN code"
                      value={form.pincode ?? ''}
                      onChange={(value) => update('pincode', value)}
                    />
                    <Field
                      id="website"
                      label="Website"
                      value={form.website ?? ''}
                      onChange={(value) => update('website', value)}
                    />
                    <Field
                      id="contactPerson"
                      label="Contact person"
                      value={form.contactPerson ?? ''}
                      onChange={(value) => update('contactPerson', value)}
                    />
                    <Field
                      id="contactEmail"
                      label="Contact email"
                      type="email"
                      value={form.contactEmail ?? ''}
                      onChange={(value) => update('contactEmail', value)}
                    />
                  </div>

                  {fieldError && (
                    <p className="text-destructive text-[12px]" role="alert">
                      {fieldError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-muted-foreground text-[11.5px]">
                      {institution._count
                        ? `${institution._count.fdrs} deposits · ${institution._count.users} users`
                        : `Registered ${formatDate(institution.createdAt)}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!dirty || save.isMutating}
                        onClick={() => {
                          if (!institution) return;
                          setForm({
                            name: institution.name,
                            address: institution.address,
                            city: institution.city,
                            state: institution.state,
                            pincode: institution.pincode,
                            phone: institution.phone,
                            email: institution.email,
                            website: institution.website ?? '',
                            contactPerson: institution.contactPerson ?? '',
                            contactPhone: institution.contactPhone ?? '',
                            contactEmail: institution.contactEmail ?? '',
                          });
                          setDirty(false);
                          setFieldError(null);
                        }}
                      >
                        Discard
                      </Button>
                      <Button type="submit" size="sm" disabled={!dirty || save.isMutating}>
                        {save.isMutating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Save changes
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Organisation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                {role === 'BANK_MANAGER' || role === 'NODAL_OFFICER'
                  ? 'You act for a bank branch. Branch details are maintained by an administrator in the bank directory.'
                  : role === 'AUDITOR'
                    ? 'You have read-only access to every institution and deposit in the portal.'
                    : 'You have system-wide access. Institution and branch records are managed from the admin console.'}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border-border/70 rounded-lg border px-3.5 py-3">
                  <p className="text-muted-foreground text-[10.5px] font-semibold uppercase tracking-wide">
                    Scope
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium">
                    {role === 'AUDITOR' || role === 'ADMIN'
                      ? 'All institutions'
                      : 'Your organisation'}
                  </p>
                </div>
                <div className="border-border/70 rounded-lg border px-3.5 py-3">
                  <p className="text-muted-foreground text-[10.5px] font-semibold uppercase tracking-wide">
                    Access
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium">
                    {role === 'AUDITOR' ? 'Read-only' : 'Full workflow'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}

function ReadOnly({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className={`mt-0.5 text-[13px] font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id} className="text-[12.5px]">
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
