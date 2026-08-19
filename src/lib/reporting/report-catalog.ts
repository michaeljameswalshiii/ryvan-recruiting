export type ReportCategory = 'pipeline' | 'activity' | 'finance' | 'performance';

export type ReportId =
  | 'funnel'
  | 'pipeline-health'
  | 'recruiter-activity'
  | 'time-to-fill'
  | 'revenue'
  | 'commission'
  | 'goals'
  | 'leaderboard'
  | 'source'
  | 'candidates-added'
  | 'client-scorecard'
  | 'digest';

export type ReportTone = 'blue' | 'peach' | 'mint';

export interface ReportDefinition {
  id: ReportId;
  title: string;
  category: ReportCategory;
  description: string;
  chips: string[];
  tone: ReportTone;
}

export const REPORT_CATEGORIES: { id: 'all' | ReportCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'activity', label: 'Activity' },
  { id: 'finance', label: 'Finance' },
  { id: 'performance', label: 'Performance' },
];

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: 'funnel',
    title: 'Candidate Funnel',
    category: 'pipeline',
    description:
      'Conversion across every stage — sourced, submitted, interviewed, offered, placed — with drop-off rates by job or recruiter.',
    chips: ['Conversion', 'Drop-off', 'Stage velocity'],
    tone: 'blue',
  },
  {
    id: 'pipeline-health',
    title: 'Pipeline Health',
    category: 'pipeline',
    description:
      'Live coverage across all open reqs. Flag empty pipelines, stalled candidates, and aging vs. target.',
    chips: ['Coverage', 'Aging reqs', 'Stalled'],
    tone: 'peach',
  },
  {
    id: 'recruiter-activity',
    title: 'Recruiter Activity',
    category: 'activity',
    description:
      'Calls, emails, submittals, and interviews logged per recruiter. Compare output across the team over any window.',
    chips: ['Calls', 'Submittals', 'Interviews'],
    tone: 'mint',
  },
  {
    id: 'time-to-fill',
    title: 'Time to Fill',
    category: 'activity',
    description:
      'Average days from job open to placement, broken out by client, role family, and recruiter vs. target.',
    chips: ['Days to fill', 'By client', 'Trend'],
    tone: 'blue',
  },
  {
    id: 'revenue',
    title: 'Revenue & Fees',
    category: 'finance',
    description:
      'Billed and forecasted placement revenue, fees by client, and remaining retainers this period.',
    chips: ['Billed', 'Forecast', 'Avg fee'],
    tone: 'peach',
  },
  {
    id: 'commission',
    title: 'Commission Report',
    category: 'finance',
    description:
      'Auto-calculated placement commissions using custom bands based on temp contracts.',
    chips: ['Payout', 'By recruiter', 'Pending'],
    tone: 'mint',
  },
  {
    id: 'goals',
    title: 'Goals & Targets',
    category: 'performance',
    description:
      'Track placements to make, jobs to fill, and revenue to hit against goals set at user, team, or company level.',
    chips: ['% to goal', 'Pace', 'Gap'],
    tone: 'mint',
  },
  {
    id: 'leaderboard',
    title: 'Team Leaderboard',
    category: 'performance',
    description:
      'Ranks recruiters by placements, revenue, and activity so you know who is driving results this period.',
    chips: ['Rank', 'Placements', 'Revenue'],
    tone: 'blue',
  },
  {
    id: 'source',
    title: 'Source Effectiveness',
    category: 'performance',
    description:
      'Which sources produce candidates that actually get placed — job boards, referrals, inbound, and outbound.',
    chips: ['By source', 'Placement', 'Costless'],
    tone: 'peach',
  },
  {
    id: 'candidates-added',
    title: 'Candidates Added',
    category: 'pipeline',
    description:
      'Net new candidates entering the database over time, sliced by recruiter, source, or company level.',
    chips: ['New adds', 'By recruiter', 'Trend'],
    tone: 'mint',
  },
  {
    id: 'client-scorecard',
    title: 'Client Scorecard',
    category: 'finance',
    description:
      'Placements, revenue, open reqs, and responsiveness per client so you can see who is worth the time.',
    chips: ['Placements', 'Revenue', 'Open reqs'],
    tone: 'blue',
  },
  {
    id: 'digest',
    title: 'Scheduled Digest',
    category: 'activity',
    description:
      'A rolled-up snapshot of your favorite reports, delivered to your inbox daily, weekly, or monthly.',
    chips: ['Automated', 'Custom list', 'Any cadence'],
    tone: 'peach',
  },
];

export function isReportId(value: string | null | undefined): value is ReportId {
  return REPORT_CATALOG.some((r) => r.id === value);
}
