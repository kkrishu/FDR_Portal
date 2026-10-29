import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  Clock,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  User,
  Users,
  Webhook,
} from 'lucide-react';
import type { UserRole } from '@fdr-portal/shared';

/** One sidebar entry. `icon` is an element so the config stays renderable. */
export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Optional keyword hints used by the ⌘K palette. */
  keywords?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const icon = 'h-[18px] w-[18px]';

const institutionNav: NavSection[] = [
  {
    title: 'Portfolio',
    items: [
      {
        label: 'Overview',
        href: '/dashboard/institution',
        icon: <LayoutDashboard className={icon} />,
        keywords: ['home', 'summary', 'dashboard'],
      },
      {
        label: 'My FDRs',
        href: '/dashboard/institution/fdrs',
        icon: <FileText className={icon} />,
        keywords: ['deposits', 'list', 'portfolio'],
      },
      {
        label: 'Submit FDR',
        href: '/dashboard/institution/submit',
        icon: <Plus className={icon} />,
        keywords: ['new', 'create', 'upload'],
      },
    ],
  },
  {
    title: 'Lifecycle',
    items: [
      {
        label: 'Release Requests',
        href: '/dashboard/institution/releases',
        icon: <ArrowLeftRight className={icon} />,
        keywords: ['closure', 'withdraw'],
      },
      {
        label: 'Renewals',
        href: '/dashboard/institution/renewals',
        icon: <RefreshCw className={icon} />,
        keywords: ['extend', 'maturity'],
      },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: <Bell className={icon} />,
        keywords: ['alerts', 'inbox'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'Profile',
        href: '/dashboard/profile',
        icon: <User className={icon} />,
        keywords: ['account', 'details'],
      },
      {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: <Settings className={icon} />,
        keywords: ['password', 'mfa', 'theme', 'preferences'],
      },
    ],
  },
];

const officerNav: NavSection[] = [
  {
    title: 'Review',
    items: [
      {
        label: 'Overview',
        href: '/dashboard/officer',
        icon: <LayoutDashboard className={icon} />,
        keywords: ['home', 'summary'],
      },
      {
        label: 'Review Queue',
        href: '/dashboard/officer/queue',
        icon: <FileText className={icon} />,
        keywords: ['pending', 'backlog', 'work'],
      },
      {
        label: 'My Cases',
        href: '/dashboard/officer/cases',
        icon: <ShieldCheck className={icon} />,
        keywords: ['assigned', 'mine'],
      },
      {
        label: 'Search',
        href: '/dashboard/officer/search',
        icon: <Search className={icon} />,
        keywords: ['find', 'lookup', 'fdr'],
      },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      {
        label: 'Expiry Tracker',
        href: '/dashboard/officer/expiry',
        icon: <Clock className={icon} />,
        keywords: ['maturity', 'due', 'soon'],
      },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: <Bell className={icon} />,
        keywords: ['alerts', 'inbox'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'Profile',
        href: '/dashboard/profile',
        icon: <User className={icon} />,
        keywords: ['account'],
      },
      {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: <Settings className={icon} />,
        keywords: ['password', 'mfa', 'theme'],
      },
    ],
  },
];

const adminNav: NavSection[] = [
  {
    title: 'Oversight',
    items: [
      {
        label: 'Overview',
        href: '/dashboard/admin',
        icon: <BarChart3 className={icon} />,
        keywords: ['home', 'summary', 'health'],
      },
      {
        label: 'Reports',
        href: '/dashboard/admin/reports',
        icon: <FileText className={icon} />,
        keywords: ['analytics', 'export', 'csv'],
      },
      {
        label: 'Audit Logs',
        href: '/dashboard/admin/audit',
        icon: <FileSearch className={icon} />,
        keywords: ['trail', 'chain', 'integrity'],
      },
    ],
  },
  {
    title: 'Directory',
    items: [
      {
        label: 'Users',
        href: '/dashboard/admin/users',
        icon: <Users className={icon} />,
        keywords: ['accounts', 'people', 'roles'],
      },
      {
        label: 'Institutions',
        href: '/dashboard/admin/institutions',
        icon: <Building2 className={icon} />,
        keywords: ['colleges', 'aicte'],
      },
      {
        label: 'Bank Directory',
        href: '/dashboard/admin/directory',
        icon: <Banknote className={icon} />,
        keywords: ['branches', 'ifsc', 'banks'],
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        label: 'Rules',
        href: '/dashboard/admin/rules',
        icon: <Settings className={icon} />,
        keywords: ['thresholds', 'sla', 'policy'],
      },
      {
        label: 'Webhooks',
        href: '/dashboard/admin/webhooks',
        icon: <Webhook className={icon} />,
        keywords: ['integrations', 'delivery'],
      },
      {
        label: 'Escalations',
        href: '/dashboard/admin/escalations',
        icon: <AlertTriangle className={icon} />,
        keywords: ['overdue', 'sla'],
      },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: <Bell className={icon} />,
        keywords: ['alerts', 'inbox'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'Profile',
        href: '/dashboard/profile',
        icon: <User className={icon} />,
        keywords: ['account'],
      },
      {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: <Settings className={icon} />,
        keywords: ['password', 'mfa', 'theme'],
      },
    ],
  },
];

const bankNav: NavSection[] = [
  {
    title: 'Verification',
    items: [
      {
        label: 'Overview',
        href: '/dashboard/bank',
        icon: <LayoutDashboard className={icon} />,
        keywords: ['home', 'summary'],
      },
      {
        label: 'Pending',
        href: '/dashboard/bank/pending',
        icon: <Clock className={icon} />,
        keywords: ['awaiting', 'action', 'queue'],
      },
      {
        label: 'Verify FDR',
        href: '/dashboard/bank/verify',
        icon: <ShieldCheck className={icon} />,
        keywords: ['token', 'otp', 'confirm'],
      },
      {
        label: 'History',
        href: '/dashboard/bank/history',
        icon: <History className={icon} />,
        keywords: ['completed', 'past'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: <Bell className={icon} />,
        keywords: ['alerts', 'inbox'],
      },
      {
        label: 'Profile',
        href: '/dashboard/profile',
        icon: <User className={icon} />,
        keywords: ['account'],
      },
      {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: <Settings className={icon} />,
        keywords: ['password', 'mfa', 'theme'],
      },
    ],
  },
];

const auditorNav: NavSection[] = [
  {
    title: 'Assurance',
    items: [
      {
        label: 'Overview',
        href: '/dashboard/auditor',
        icon: <BarChart3 className={icon} />,
        keywords: ['home', 'summary'],
      },
      {
        label: 'Audit Logs',
        href: '/dashboard/admin/audit',
        icon: <FileSearch className={icon} />,
        keywords: ['trail', 'chain', 'integrity'],
      },
      {
        label: 'Reports',
        href: '/dashboard/admin/reports',
        icon: <FileText className={icon} />,
        keywords: ['analytics', 'export'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: <Bell className={icon} />,
        keywords: ['alerts', 'inbox'],
      },
      {
        label: 'Profile',
        href: '/dashboard/profile',
        icon: <User className={icon} />,
        keywords: ['account'],
      },
      {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: <Settings className={icon} />,
        keywords: ['password', 'mfa', 'theme'],
      },
    ],
  },
];

const NAV_BY_ROLE: Record<UserRole, NavSection[]> = {
  INSTITUTION: institutionNav,
  OFFICER: officerNav,
  ADMIN: adminNav,
  BANK_MANAGER: bankNav,
  NODAL_OFFICER: bankNav,
  AUDITOR: auditorNav,
};

/** Sidebar sections for a role. Shared so every page renders the same navigation. */
export function getNavSections(role: UserRole = 'INSTITUTION'): NavSection[] {
  return NAV_BY_ROLE[role] ?? institutionNav;
}

/** Flat list of every destination for a role, used by the ⌘K palette. */
export function getNavItems(role: UserRole = 'INSTITUTION'): NavItem[] {
  return getNavSections(role).flatMap((section) => section.items);
}

export const ROLE_LABEL: Record<UserRole, string> = {
  INSTITUTION: 'Institution',
  OFFICER: 'Reviewing Officer',
  ADMIN: 'Administrator',
  BANK_MANAGER: 'Bank Manager',
  NODAL_OFFICER: 'Nodal Officer',
  AUDITOR: 'Auditor',
};
