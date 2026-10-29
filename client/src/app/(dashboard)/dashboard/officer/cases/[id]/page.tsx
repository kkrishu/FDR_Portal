'use client';

import { useParams } from 'next/navigation';
import { FdrDetailView } from '@/components/fdr/fdr-detail';

export default function OfficerCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const fdrId = typeof params.id === 'string' ? params.id : '';

  return <FdrDetailView fdrId={fdrId} backHref="/dashboard/officer/cases" />;
}
