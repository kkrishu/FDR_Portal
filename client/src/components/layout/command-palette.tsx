'use client';

/**
 * Command palette (⌘K).
 *
 * Two kinds of result: navigation to any page the signed-in role can reach, and
 * a live FDR lookup for officers and admins. Typing filters navigation locally
 * and queries the API for records, so the palette is useful even before the
 * first character lands.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  CornerDownLeft,
  FileText,
  Loader2,
  Monitor,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import type { UserRole } from '@fdr-portal/shared';
import { getNavItems } from '@/config/navigation';
import { getDashboardRoute, useAuthStore } from '@/lib/auth';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency } from '@/lib/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

interface SearchResult {
  id: string;
  fdrNumber: string;
  bankName: string;
  amount: number;
  status: string;
  institution?: { name: string };
}

export function CommandPalette() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setTheme } = useTheme();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  const role = (user?.role ?? 'INSTITUTION') as UserRole;
  const navItems = React.useMemo(() => getNavItems(role), [role]);
  const canSearchRecords = role === 'OFFICER' || role === 'ADMIN';

  // ⌘K / Ctrl+K from anywhere.
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Debounce so a fast typist does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  // `/officer/search` returns the records array directly with paging in `meta`.
  const { data: searchResults, isLoading: isSearching } = useApi<SearchResult[]>(
    canSearchRecords && debouncedQuery.length >= 2
      ? ['/officer/search', { q: debouncedQuery, limit: 5 }]
      : null
  );

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  const run = React.useCallback((action: () => void) => {
    setOpen(false);
    // Let the dialog start its close transition before navigating.
    window.setTimeout(action, 10);
  }, []);

  const filteredNav = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return navItems;
    return navItems.filter((item) => {
      const haystack = [item.label, item.href, ...(item.keywords ?? [])].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [navItems, query]);

  const records = searchResults ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border/70 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring group hidden h-9 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 md:flex md:w-64 lg:w-72"
        aria-label="Open search"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Search or jump to…</span>
        <kbd className="border-border/70 bg-background text-muted-foreground ml-auto hidden shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium lg:flex">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* Icon-only trigger on small screens, where the wide bar does not fit. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 md:hidden"
        aria-label="Open search"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, records…" value={query} onValueChange={setQuery} />
        <CommandList>
          {debouncedQuery.length >= 2 && canSearchRecords && (
            <CommandGroup heading={isSearching ? 'Searching records…' : 'FDR records'}>
              {isSearching && records.length === 0 && (
                <div className="text-muted-foreground flex items-center gap-2 px-2.5 py-3 text-[13px]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking for “{debouncedQuery}”…
                </div>
              )}
              {records.map((record) => (
                <CommandItem
                  key={record.id}
                  value={`fdr-${record.id}`}
                  onSelect={() => run(() => router.push(`/dashboard/officer/cases/${record.id}`))}
                >
                  <FileText className="text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{record.fdrNumber}</p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {record.institution?.name ?? record.bankName} ·{' '}
                      {formatCurrency(record.amount)}
                    </p>
                  </div>
                  <ArrowRight className="text-muted-foreground/60" />
                </CommandItem>
              ))}
              {!isSearching && records.length === 0 && (
                <div className="text-muted-foreground px-2.5 py-3 text-[13px]">
                  No records match “{debouncedQuery}”.
                </div>
              )}
            </CommandGroup>
          )}

          <CommandGroup heading="Navigate">
            {filteredNav.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.href}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <CornerDownLeft className="text-muted-foreground/50 h-3.5 w-3.5" />
              </CommandItem>
            ))}
            {filteredNav.length === 0 && (
              <div className="text-muted-foreground px-2.5 py-3 text-[13px]">No pages match.</div>
            )}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem value="theme light" onSelect={() => run(() => setTheme('light'))}>
              <Sun className="text-muted-foreground" />
              Switch to light theme
            </CommandItem>
            <CommandItem value="theme dark" onSelect={() => run(() => setTheme('dark'))}>
              <Moon className="text-muted-foreground" />
              Switch to dark theme
            </CommandItem>
            <CommandItem value="theme system" onSelect={() => run(() => setTheme('system'))}>
              <Monitor className="text-muted-foreground" />
              Follow system theme
            </CommandItem>
            <CommandItem
              value="go to dashboard"
              onSelect={() => run(() => router.push(getDashboardRoute(role)))}
            >
              <Search className="text-muted-foreground" />
              Go to my dashboard
              <CommandShortcut>home</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandEmpty>Type to search pages and records.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  );
}
