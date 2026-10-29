'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, getDashboardRoute } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

/**
 * Entry point for /dashboard. Role dashboards live at
 * /dashboard/{institution,officer,admin,bank}, so this route only exists to
 * send people to the right one instead of 404ing or rendering nothing.
 */
export default function DashboardIndexPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      router.replace(getDashboardRoute(user.role));
      return;
    }

    router.replace('/login');
  }, [isAuthenticated, isLoading, user, router]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Redirecting to your dashboard…</p>
      </div>
    </div>
  );
}
