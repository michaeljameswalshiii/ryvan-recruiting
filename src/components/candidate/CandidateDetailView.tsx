'use client';

import { CandidateDetailClient } from './CandidateDetailClient';

interface CandidateDetailViewProps {
  candidate: any;
}

export default function CandidateDetailView({ candidate }: CandidateDetailViewProps) {
  return <CandidateDetailClient candidate={candidate} />;
}
