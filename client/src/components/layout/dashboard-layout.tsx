'use client';

/**
 * Application shell.
 *
 * Owns the auth guard, the persistent sidebar, and the toolbar. The toolbar
 * carries the three things a user reaches for on every screen: search (⌘K),
 * notifications, and the account menu. Page titles live in the page itself via
 * `PageHeader`, so each page can also own its actions.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Loader2, LogOut, Settings, ShieldCheck, Sparkles, User } from 'lucide-react';
import { useSWRConfig } from 'swr';
import type { UserRole } from '@fdr-portal/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/ui/logo';
import { CommandPalette } from '@/components/layout/command-palette';
import { GuidedTour } from '@/components/layout/guided-tour';
import { NotificationBell } from '@/components/layout/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { getDashboardRoute, useAuthStore } from '@/lib/auth';
import { getNavSections, ROLE_LABEL } from '@/config/navigation';
import { useApi } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';

const PAGE_META: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/institution': 'Overview',
  '/dashboard/institution/fdrs': 'My FDRs',
  '/dashboard/institution/submit': 'Submit FDR',
  '/dashboard/institution/releases': 'Release Requests',
  '/dashboard/institution/renewals': 'Renewals',
  '/dashboard/officer': 'Overview',
  '/dashboard/officer/queue': 'Review Queue',
  '/dashboard/officer/cases': 'My Cases',
  '/dashboard/officer/expiry': 'Expiry Tracker',
  '/dashboard/officer/search': 'Search',
  '/dashboard/admin': 'Overview',
  '/dashboard/admin/users': 'Users',
  '/dashboard/admin/institutions': 'Institutions',
  '/dashboard/admin/directory': 'Bank Directory',
  '/dashboard/admin/rules': 'Rules',
  '/dashboard/admin/reports': 'Reports',
  '/dashboard/admin/audit': 'Audit Logs',
  '/dashboard/admin/webhooks': 'Webhooks',
  '/dashboard/admin/escalations': 'Escalations',
  '/dashboard/bank': 'Overview',
  '/dashboard/bank/pending': 'Pending Verification',
  '/dashboard/bank/verify': 'Verify FDR',
  '/dashboard/bank/history': 'Verification History',
  '/dashboard/bank/nodal': 'Nodal Review',
  '/dashboard/auditor': 'Overview',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
};

function resolveTitle(pathname: string): string {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const match = Object.keys(PAGE_META)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_META[match] : 'Dashboard';
}

/**
 * Sidebar hrefs to tour anchors. Only entries the tour references need a name;
 * everything else simply has none.
 */
const TOUR_TARGETS: Record<string, string> = {
  '/dashboard/institution': 'nav-overview',
  '/dashboard/institution/fdrs': 'nav-fdrs',
  '/dashboard/institution/submit': 'nav-submit',
  '/dashboard/institution/releases': 'nav-releases',
  '/dashboard/institution/renewals': 'nav-renewals',
  '/dashboard/officer/queue': 'nav-queue',
  '/dashboard/officer/cases': 'nav-cases',
  '/dashboard/officer/expiry': 'nav-expiry',
  '/dashboard/officer/search': 'nav-search',
  '/dashboard/admin/users': 'nav-users',
  '/dashboard/admin/institutions': 'nav-institutions',
  '/dashboard/admin/directory': 'nav-directory',
  '/dashboard/admin/rules': 'nav-rules',
  '/dashboard/admin/audit': 'nav-audit',
  '/dashboard/admin/reports': 'nav-reports',
  '/dashboard/bank/pending': 'nav-pending',
  '/dashboard/bank/verify': 'nav-verify',
  '/dashboard/bank/history': 'nav-history',
};

function tourTargetFor(href: string): string | undefined {
  return TOUR_TARGETS[href];
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

function BrandHeader() {
  return (
    <SidebarHeader className="pt-4">
      <Link
        href="/dashboard"
        className="focus-visible:ring-ring flex items-center gap-2.5 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      >
        <Logo markOnly className="h-8 w-8 shrink-0" />
        <span className="min-w-0 group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-[15px] font-semibold leading-tight tracking-[-0.01em]">
            FDR Portal
          </span>
          <span className="text-muted-foreground block truncate text-[10.5px] leading-tight">
            AICTE deposit management
          </span>
        </span>
      </Link>
    </SidebarHeader>
  );
}

function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const sections = getNavSections(role);

  // Unread count drives a badge on the notifications entry.
  const { meta } = useApi<unknown[]>(['/notifications', { limit: 1 }]);
  const unreadCount = meta?.unreadCount ?? 0;

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <BrandHeader />
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          active &&
                            'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary font-semibold'
                        )}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          data-tour={tourTargetFor(item.href)}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.href === '/dashboard/notifications' && unreadCount > 0 && (
                        <SidebarMenuBadge className="bg-primary text-primary-foreground">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="pb-3">
        <Separator className="mb-1" />
        <div className="text-muted-foreground flex items-center gap-2 px-2.5 text-[11px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            All systems operational
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Keeps the ⌘K hint and the trigger in one place inside the sidebar context. */
function Toolbar() {
  const { toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;
  const title = resolveTitle(pathname);
  const homeRoute = getDashboardRoute(role);

  const handleSignOut = () => {
    logout();
    // Drop every cached response so the next account never sees this one's data.
    void mutate(() => true, undefined, { revalidate: false });
    router.replace('/login');
  };

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-3 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          onClick={toggleSidebar}
          aria-label="Open navigation"
        >
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </Button>

        <SidebarTrigger className="hidden lg:inline-flex" />

        <nav
          aria-label="Breadcrumb"
          className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex"
        >
          {ROLE_LABEL[role] !== title && (
            <>
              <Link
                href={homeRoute}
                className="text-muted-foreground hover:text-foreground truncate transition-colors"
              >
                {ROLE_LABEL[role]}
              </Link>
              <ChevronRight className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
            </>
          )}
          <span className="text-foreground truncate font-medium">{title}</span>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <span data-tour="search" className="inline-flex">
            <CommandPalette />
          </span>
          <span data-tour="theme" className="inline-flex">
            <ThemeToggle />
          </span>
          <span data-tour="notifications" className="inline-flex">
            <NotificationBell />
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-tour="account"
                className="hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
                aria-label="Account menu"
              >
                <Avatar className="ring-border/60 h-8 w-8 ring-1">
                  {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                    {getInitials(user?.name || 'User')}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-[13px] font-medium xl:block">
                  {user?.name}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
                  <span className="bg-primary/10 text-primary mt-1.5 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {ROLE_LABEL[role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.dispatchEvent(new Event('fdr:replay-tour'))}>
                <Sparkles className="mr-2 h-4 w-4" />
                Replay tour
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function WorkspaceLoader() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="bg-primary/10 absolute inset-0 rounded-2xl blur-xl" />
          <Loader2 className="text-primary relative h-6 w-6 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">Loading your workspace…</p>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const role = (useAuthStore((state) => state.user?.role) ?? 'INSTITUTION') as UserRole;

  // The auth store persists to localStorage, so the first client render has no
  // user yet. Waiting for `mounted` avoids a hydration mismatch and a spurious
  // redirect to /login on every page load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!isAuthenticated) router.replace('/login');
  }, [mounted, isLoading, isAuthenticated, router]);

  if (!mounted || isLoading || !isAuthenticated) {
    return <WorkspaceLoader />;
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar role={role} />
      <SidebarInset>
        <Toolbar />
        <div className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Re-keying on the path replays the enter animation per navigation. */}
          <div key={pathname} className="animate-fade-in-up">
            {children}
          </div>
        </div>
        {!isLoading && <GuidedTour />}
      </SidebarInset>
    </SidebarProvider>
  );
}
