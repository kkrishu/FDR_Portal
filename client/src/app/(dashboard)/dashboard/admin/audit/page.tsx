'use client';

/**
 * Audit Logs - Dual View
 *
 * Two log streams in one place:
 * 1. FDR Business Logs - Business audit trail (FDR submissions, verifications, flags, releases)
 * 2. Technical System Logs - System operations (logins, user management, settings changes, webhooks)
 *
 * Both use the same tamper-evident hash chain. Switch tabs to filter by entity type.
 */

import * as React from 'react';
import {
  FileSearch,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Download,
  Calendar,
  Search,
  Filter,
  X,
  Globe,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { cn, formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  userAgent: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  hash: string;
  previousHash: string | null;
  createdAt: string;
}

interface ChainResult {
  isValid: boolean;
  totalLogs: number;
  errors: Array<{ id: string; error: string; createdAt: string }>;
}

// Entity types for each tab
const FDR_ENTITY_TYPES = [
  'FDR',
  'VerificationRequest',
  'VerificationResult',
  'ReleaseRequest',
  'FDRFlag',
  'FDRTimelineEntry',
  'Institution',
  'Bank',
  'BankBranch',
];
const TECHNICAL_ENTITY_TYPES = [
  'User',
  'UserSession',
  'Webhook',
  'WebhookDelivery',
  'WebhookDeadLetter',
  'APIKey',
  'RulesConfig',
  'RefreshToken',
  'PasswordResetToken',
  'Notification',
];

const FDR_ACTIONS = [
  '',
  'FDR_SUBMITTED',
  'FDR_VERIFIED',
  'FDR_FLAGGED',
  'BANK_VERIFIED',
  'BANK_FLAGGED',
  'RELEASE_REQUESTED',
  'RELEASE_RECOMMENDED',
  'RELEASE_APPROVED',
  'RELEASE_REJECTED',
  'RELEASE_COMPLETED',
  'VERIFICATION_REQUESTED',
  'VERIFICATION_COMPLETED',
  'NODAL_VERIFIED',
  'NODAL_FLAGGED',
  'FLAG_CREATED',
  'FLAG_RESOLVED',
  'DOCUMENT_UPLOADED',
  'RENEWAL_REQUESTED',
];

const TECHNICAL_ACTIONS = [
  '',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_VERIFIED',
  'WEBHOOK_CREATED',
  'WEBHOOK_UPDATED',
  'WEBHOOK_DELETED',
  'WEBHOOK_TEST_SENT',
  'RULES_UPDATED',
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
  'INSTITUTION_CREATED',
  'INSTITUTION_UPDATED',
  'BANK_CREATED',
  'BANK_UPDATED',
];

export default function AdminAuditPage() {
  const [activeTab, setActiveTab] = React.useState<'fdr' | 'technical'>('fdr');
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [entityType, setEntityType] = React.useState('');
  const [actorId, setActorId] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [chain, setChain] = React.useState<ChainResult | null>(null);
  const [detailRow, setDetailRow] = React.useState<AuditRow | null>(null);

  const entityTypes = activeTab === 'fdr' ? FDR_ENTITY_TYPES : TECHNICAL_ENTITY_TYPES;
  const actions = activeTab === 'fdr' ? FDR_ACTIONS : TECHNICAL_ACTIONS;

  // Build query params
  const queryParams: Record<string, string> = { page: String(page), limit: '20' };
  if (action) queryParams.action = action;
  if (search) queryParams.search = search;
  if (dateFrom) queryParams.dateFrom = dateFrom;
  if (dateTo) queryParams.dateTo = dateTo;
  if (entityType) queryParams.entityType = entityType;
  if (actorId) queryParams.actorId = actorId;

  const { data, meta, isLoading, errorMessage, refresh } = useApi<AuditRow[]>([
    '/audit',
    queryParams,
  ]);

  const verify = useDynamicMutation<ChainResult>('post', { errorMessage: false });

  const runVerify = async () => {
    try {
      const result = await verify.run('/audit/verify', {});
      if (result) setChain(result);
    } catch {
      setChain(null);
    }
  };

  const handleExport = async (exportFormat: 'csv' | 'json') => {
    const params = new URLSearchParams(queryParams);
    params.set('format', exportFormat);
    const response = await fetch(`/api/v1/audit/export?${params.toString()}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `audit-logs-${activeTab}-${exportFormat}-${dateStr}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const clearFilters = () => {
    setAction('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setEntityType('');
    setActorId('');
    setPage(1);
  };

  const hasFilters = action || search || dateFrom || dateTo || entityType || actorId;

  const rows = data ?? [];

  const getCountryFlag = (countryCode?: string | null) => {
    if (!countryCode) return '🌐';
    return String.fromCodePoint(
      ...countryCode
        .toUpperCase()
        .split('')
        .map((c) => 127397 + c.charCodeAt(0))
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Audit logs"
          description="Append-only, tamper-evident record of all consequential actions. Two views: FDR business activity and technical system operations."
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={isLoading || rows.length === 0}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('json')}
                disabled={isLoading || rows.length === 0}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runVerify()}
                disabled={verify.isMutating}
              >
                {verify.isMutating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                )}
                Verify chain
              </Button>
            </div>
          }
        />

        {/* Tab Navigation */}
        <div className="bg-muted flex gap-1 rounded-lg p-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'fdr'}
            onClick={() => {
              setActiveTab('fdr');
              setPage(1);
              setAction('');
            }}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'fdr'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            📊 FDR Business Logs
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'technical'}
            onClick={() => {
              setActiveTab('technical');
              setPage(1);
              setAction('');
            }}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'technical'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            🔧 Technical Logs
          </button>
        </div>

        {chain && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              chain.isValid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
            )}
          >
            {chain.isValid ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="text-[13px]">
              <p className="font-semibold">
                {chain.isValid ? 'Hash chain intact' : 'Hash chain compromised'}
              </p>
              <p className="mt-0.5 text-[12px]">
                {chain.isValid
                  ? `All ${chain.totalLogs} entries re-verified against their recorded hashes.`
                  : `${chain.errors.length} of ${chain.totalLogs} entries failed verification. First failure: ${chain.errors[0]?.id}`}
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Filters */}
        <Card className="border-border/50">
          <CardContent className="pb-2 pt-4">
            {/* Quick Filters - Actions */}
            <div className="mb-4">
              <label className="text-muted-foreground mb-2 block text-[11px] font-medium uppercase tracking-wide">
                Filter by Action
              </label>
              <div className="flex flex-wrap gap-1.5">
                {actions.map((option) => (
                  <button
                    key={option || 'all'}
                    type="button"
                    onClick={() => {
                      setAction(option);
                      setPage(1);
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                      action === option
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {option ? option.replace(/_/g, ' ').toLowerCase() : 'All actions'}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Filters Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="mb-3"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? (
                <>
                  <ChevronUp className="mr-1.5 h-4 w-4" />
                  Hide advanced filters
                </>
              ) : (
                <>
                  <Filter className="mr-1.5 h-4 w-4" />
                  Show advanced filters
                </>
              )}
            </Button>

            {/* Advanced Filters */}
            {showAdvanced && (
              <div
                className="animate-slide-down space-y-3"
                style={{ maxHeight: showAdvanced ? '500px' : '0', overflow: 'hidden' }}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                      placeholder="Search in before/after, actor, entity..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>

                  {/* Entity Type */}
                  <Select
                    value={entityType}
                    onValueChange={(v) => {
                      setEntityType(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All entity types</SelectItem>
                      {entityTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Actor ID */}
                  <Input
                    placeholder="Actor ID (user ID)"
                    value={actorId}
                    onChange={(e) => {
                      setActorId(e.target.value);
                      setPage(1);
                    }}
                  />

                  {/* Date Range */}
                  <div className="flex items-center gap-2">
                    <Calendar className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setPage(1);
                      }}
                      placeholder="From"
                      className="w-full"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setPage(1);
                      }}
                      placeholder="To"
                      className="w-full"
                    />
                  </div>
                </div>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Clear all filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={FileSearch}
                title="No audit entries"
                description="Nothing has been recorded for this filter yet."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead>
                      <tr className="border-b">
                        {['When', 'Actor', 'Action', 'Entity', 'Location', 'Details'].map(
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
                      {rows.map((row, index) => (
                        <tr
                          key={row.id}
                          className="animate-fade-in-up hover:bg-accent/30 cursor-pointer border-b last:border-0"
                          style={{ animationDelay: `${Math.min(index, 14) * 18}ms` }}
                          onClick={() => setDetailRow(row)}
                        >
                          <td className="text-muted-foreground whitespace-nowrap py-2.5 pr-3 text-[11.5px] tabular-nums">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <p className="text-[12.5px] font-medium">{row.actorName}</p>
                            <p className="text-muted-foreground text-[10.5px]">
                              {row.actorRole.replace(/_/g, ' ').toLowerCase()}
                              {row.actorId && (
                                <span className="ml-1 font-mono text-[9px]">
                                  ({row.actorId.slice(0, 8)}…)
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium">
                              {row.action}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <p className="text-[12px] font-medium">{row.entityType}</p>
                            <p className="text-muted-foreground font-mono text-[10px]">
                              {row.entityId.slice(0, 8)}…
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              {row.ipAddress && (
                                <>
                                  <span className="font-mono text-[11px]">{row.ipAddress}</span>
                                  {(row.country || row.city) && (
                                    <span
                                      className="text-muted-foreground flex items-center gap-1 text-[10px]"
                                      title={`${row.city || ''}, ${row.region || ''}, ${row.country || ''}`}
                                    >
                                      <Globe className="h-3 w-3" />
                                      {row.country && getCountryFlag(row.country)}
                                      {row.city && <span>{row.city}</span>}
                                      {row.region && <span>{row.region}</span>}
                                    </span>
                                  )}
                                </>
                              )}
                              {!row.ipAddress && <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailRow(row);
                              }}
                              aria-label="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

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
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail Modal */}
        {detailRow && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDetailRow(null)}
          >
            <Card className="animate-slide-up max-h-[80vh] w-full max-w-4xl overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{detailRow.action}</CardTitle>
                    <p className="text-muted-foreground text-sm">
                      {detailRow.entityType} · {formatDateTime(detailRow.createdAt)} ·{' '}
                      {detailRow.actorName} ({detailRow.actorRole})
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDetailRow(null)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-auto p-4">
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">IP Address</p>
                    <p className="font-mono text-sm">{detailRow.ipAddress ?? '—'}</p>
                  </div>
                  {detailRow.country && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">Location</p>
                      <p className="flex items-center gap-1 text-sm">
                        {getCountryFlag(detailRow.country)} {detailRow.city || ''},{' '}
                        {detailRow.region || ''}, {detailRow.country}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">User Agent</p>
                    <p className="truncate font-mono text-xs">{detailRow.userAgent ?? '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">Hash</p>
                    <p className="truncate font-mono text-xs">{detailRow.hash}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {detailRow.before && Object.keys(detailRow.before).length > 0 && (
                    <div>
                      <p className="text-muted-foreground mb-2 text-xs">Before (Previous State)</p>
                      <pre className="bg-muted max-h-64 overflow-auto rounded p-3 font-mono text-[10px]">
                        {JSON.stringify(detailRow.before, null, 2)}
                      </pre>
                    </div>
                  )}
                  {detailRow.after && Object.keys(detailRow.after).length > 0 && (
                    <div>
                      <p className="text-muted-foreground mb-2 text-xs">After (New State)</p>
                      <pre className="bg-muted max-h-64 overflow-auto rounded p-3 font-mono text-[10px]">
                        {JSON.stringify(detailRow.after, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!detailRow.before && !detailRow.after && (
                    <p className="text-muted-foreground py-4 text-center text-sm">
                      No state changes recorded for this action
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
