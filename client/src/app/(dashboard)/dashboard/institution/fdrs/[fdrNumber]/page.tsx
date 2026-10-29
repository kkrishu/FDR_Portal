'use client';

import { useParams } from 'next/navigation';
import { FdrDetailView } from '@/components/fdr/fdr-detail';

export default function FDRDetailPage() {
  // The route segment is named `fdrNumber` for readability in the URL, but the
  // detail endpoint keys on the record id.
  const params = useParams<{ fdrNumber: string }>();
  const fdrId = typeof params.fdrNumber === 'string' ? params.fdrNumber : '';

  return <FdrDetailView fdrId={fdrId} backHref="/dashboard/institution/fdrs" />;
}
