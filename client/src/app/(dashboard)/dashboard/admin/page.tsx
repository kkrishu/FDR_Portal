'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { OverviewDashboard } from '@/components/layout/overview-dashboard';

export default function Page() {
  return (
    <DashboardLayout>
      <OverviewDashboard />
    </DashboardLayout>
  );
}
