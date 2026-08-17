/**
 * Shared WIP / pipeline stage buckets for job detail + dedicated pipeline page.
 */

export const PIPELINE_BUCKETS = [
  {
    key: 'attached',
    label: 'Attached',
    match: null as string[] | null, // all linked
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    ring: 'ring-slate-200',
  },
  {
    key: 'submitted',
    label: 'Submitted',
    match: ['submitted', 'pre_screened', 'Screening', 'Applied', 'applied'],
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    ring: 'ring-sky-100',
  },
  {
    key: 'interviewing',
    label: 'Interviewing',
    match: [
      'interviewing',
      'Interviewing',
      'interview',
      'second_interview',
      'third_interview',
      '2nd_interview',
      '3rd_interview',
      '2nd interview',
      '3rd interview',
      'second interview',
      'third interview',
    ],
    bg: 'bg-violet-50',
    text: 'text-violet-800',
    ring: 'ring-violet-100',
  },
  {
    key: 'offer_out',
    label: 'Offer Out',
    match: [
      'offer_out',
      'offer_accepted',
      'Offered',
      'offer',
      'placed',
      'offered',
    ],
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    ring: 'ring-amber-100',
  },
  {
    key: 'rejected',
    label: 'Rejected',
    match: [
      'rejected',
      'Rejected',
      'offer_declined',
      'not_interested',
      'Withdrawn',
      'dnu',
    ],
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    ring: 'ring-rose-100',
  },
] as const;

export type PipelineBucketKey = (typeof PIPELINE_BUCKETS)[number]['key'];
export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export function isPipelineBucketKey(value: string | null | undefined): value is PipelineBucketKey {
  if (!value) return false;
  return PIPELINE_BUCKETS.some((b) => b.key === value);
}

export function getPipelineBucket(
  key: string | null | undefined
): PipelineBucket | undefined {
  if (!key) return undefined;
  return PIPELINE_BUCKETS.find((b) => b.key === key);
}

export function candidateMatchesBucket(
  stage: string | undefined,
  bucket: PipelineBucket
): boolean {
  if (bucket.match === null) return true;
  const s = String(stage || '').toLowerCase();
  if (bucket.match.some((m) => s === m.toLowerCase())) return true;
  // "2nd Interview" / "2nd_interview" must still hit the interviewing bucket
  if (bucket.key === 'interviewing' && s.includes('interview') && !s.includes('offer')) {
    return true;
  }
  return false;
}

export function pipelineHref(jobId: string, stage?: PipelineBucketKey | null): string {
  const base = `/dashboard/jobs/${jobId}/pipeline`;
  if (!stage || stage === 'attached') return base;
  return `${base}?stage=${encodeURIComponent(stage)}`;
}
