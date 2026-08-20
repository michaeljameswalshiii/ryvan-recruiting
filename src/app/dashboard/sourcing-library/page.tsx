import { Suspense } from 'react';
import { SourcingLibraryClient } from '@/components/sourcing-library/SourcingLibraryClient';

export default function SourcingLibraryPage() {
  return (
    <Suspense fallback={null}>
      <SourcingLibraryClient />
    </Suspense>
  );
}
