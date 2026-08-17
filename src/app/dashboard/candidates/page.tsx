import { Suspense } from 'react';
import { CandidatesClient } from '@/components/candidates/CandidatesClient';

export default function CandidatesPage() {
  return (
    <Suspense fallback={null}>
      <CandidatesClient />
    </Suspense>
  );
}
