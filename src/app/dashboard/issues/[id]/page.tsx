'use client';

import { useParams } from 'next/navigation';
import IssueDetailClient from '@/components/issues/IssueDetailClient';

/**
 * Issue detail — opened from the Issues list row click.
 */
export default function IssueDetailPage() {
  const params = useParams();
  const id = params.id as string;

  if (!id) {
    return (
      <div className="p-8 text-center text-gray-500">Invalid issue id</div>
    );
  }

  return <IssueDetailClient issueId={id} />;
}
