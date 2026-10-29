import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `${(num / 100000).toFixed(2)} L`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)} K`;
  }
  return num.toString();
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length - 3)}...`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'secondary',
    SUBMITTED: 'info',
    AWAITING_BANK_VERIFICATION: 'warning',
    BANK_VERIFIED: 'success',
    BANK_FLAGGED: 'destructive',
    UNDER_REVIEW: 'info',
    VERIFIED: 'success',
    FLAGGED: 'destructive',
    MANUAL_VERIFIED: 'warning',
    EXPIRED: 'destructive',
    RENEWAL_PENDING: 'warning',
    RENEWED: 'success',
    RELEASE_REQUESTED: 'info',
    RELEASE_RECOMMENDED: 'warning',
    RELEASE_APPROVED: 'success',
    RELEASE_REJECTED: 'destructive',
    RELEASED: 'success',
  };
  return colors[status] || 'secondary';
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    INSTITUTION: 'blue',
    OFFICER: 'purple',
    ADMIN: 'red',
    BANK_MANAGER: 'green',
    NODAL_OFFICER: 'teal',
    AUDITOR: 'orange',
  };
  return colors[role] || 'gray';
}
