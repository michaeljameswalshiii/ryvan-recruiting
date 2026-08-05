'use client';

/**
 * Candidate SMS panel — thin wrapper around EntitySmsPanel.
 */

import { EntitySmsPanel } from '@/components/shared/EntitySmsPanel';

export function CandidateSmsPanel({
  candidateId,
  phone,
  candidateName,
}: {
  candidateId: string;
  phone?: string;
  candidateName?: string;
}) {
  return (
    <EntitySmsPanel
      entity="candidate"
      entityId={candidateId}
      phone={phone}
      entityName={candidateName}
    />
  );
}
