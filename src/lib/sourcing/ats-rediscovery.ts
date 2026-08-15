import { getAllLeads } from '@/lib/db/repositories/lead-repository';
import type { JobContext, SourcedCandidate } from './job-candidate-search';

const STOP_WORDS = new Set([
  'and', 'are', 'for', 'from', 'has', 'have', 'into', 'job', 'our', 'role',
  'that', 'the', 'their', 'this', 'with', 'will', 'you', 'your',
]);

function terms(value: unknown): string[] {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)))];
}

function overlap(needles: string[], haystack: Set<string>): number {
  return needles.filter((term) => haystack.has(term)).length;
}

export type AtsRediscoveryCandidate = SourcedCandidate & {
  source: 'ats';
  rediscoveryScore: number;
  evidence: string[];
};

export function rankAtsCandidate(
  lead: Record<string, unknown>,
  job: JobContext
): AtsRediscoveryCandidate | null {
  const name = String(lead.name || '').trim();
  if (!name) return null;

  const title = String(lead.title || '').trim();
  const location = String(lead.location || lead.full_address || '').trim();
  const skills = Array.isArray(lead.skills) ? lead.skills.map(String) : [];
  const experience = Array.isArray(lead.experience)
    ? lead.experience as Array<Record<string, unknown>>
    : [];
  const currentCompany = String(experience[0]?.company || '').trim();

  const titleTerms = terms(job.title);
  const skillTerms = terms([...(job.keywords || []), job.description || ''].join(' '));
  const profileTerms = new Set(terms([
    title,
    skills.join(' '),
    lead.summary,
    experience.map((row) => `${row.title || ''} ${row.company || ''} ${row.description || ''}`).join(' '),
  ].join(' ')));

  const titleHits = overlap(titleTerms, profileTerms);
  const skillHits = overlap(skillTerms.slice(0, 30), profileTerms);
  const exactTitle = title && job.title && title.toLowerCase() === job.title.toLowerCase();
  const titleScore = exactTitle
    ? 55
    : Math.min(50, titleHits * 16 + (titleHits > 1 ? 8 : 0));
  const skillScore = Math.min(35, skillHits * 7);
  const profileDepth = Math.min(10,
    (skills.length ? 4 : 0) +
    (experience.length ? 4 : 0) +
    (String(lead.summary || '').trim() ? 2 : 0)
  );
  const identityScore = lead.email || lead.phone || lead.linkedin_url ? 5 : 0;
  const score = Math.min(100, titleScore + skillScore + profileDepth + identityScore);
  if (score < 24) return null;

  const evidence = [
    exactTitle ? 'Exact title match in Trio' : titleHits ? `${titleHits} title term match${titleHits === 1 ? '' : 'es'}` : '',
    skillHits ? `${skillHits} job-skill signal${skillHits === 1 ? '' : 's'} in the profile` : '',
    experience.length ? 'Existing experience history' : '',
  ].filter(Boolean);

  return {
    id: String(lead.id || `ats-${name.toLowerCase().replace(/\W+/g, '-')}`),
    name,
    title: title || undefined,
    company: currentCompany || undefined,
    location: location || undefined,
    email: String(lead.email || '').trim() || undefined,
    phone: String(lead.phone || '').trim() || undefined,
    linkedinUrl: String(lead.linkedin_url || '').trim() || undefined,
    source: 'ats',
    fitScore: score,
    qualityScore: score,
    fitReason: `Already in Trio${evidence.length ? ` — ${evidence.join('; ')}` : ''}`,
    snippet: `ATS rediscovery${evidence.length ? `: ${evidence.join('; ')}` : ''}`,
    rediscoveryScore: score,
    evidence,
  };
}

export async function rediscoverAtsCandidates(params: {
  tenantId: string;
  job: JobContext;
  limit?: number;
}): Promise<AtsRediscoveryCandidate[]> {
  const leads = await getAllLeads(params.tenantId);
  return leads
    .map((lead) => rankAtsCandidate(lead as unknown as Record<string, unknown>, params.job))
    .filter((candidate): candidate is AtsRediscoveryCandidate => Boolean(candidate))
    .sort((a, b) => b.rediscoveryScore - a.rediscoveryScore)
    .slice(0, Math.max(1, Math.min(params.limit || 25, 100)));
}
