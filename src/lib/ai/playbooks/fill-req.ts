/**
 * Playbook: "Fill this req"
 * Server-side orchestration — load job, score candidates, draft outreach, plan enrollments.
 * Does NOT auto-mutate CRM unless executeFillReqActions is called with confirmed: true.
 *
 * External Apollo search is intentionally skipped without API keys (next step).
 *
 * @serverOnly
 */

import { getJobById, linkCandidateToJob } from '@/lib/db/repositories/job-repository';
import { getAllLeads, getLeadById } from '@/lib/db/repositories/lead-repository';
import {
  enrollCandidate,
  getSequence,
  listSequences,
} from '@/lib/db/repositories/sequence-repository';
import {
  buildFirstTouchDraft,
  generateAiFirstDraft,
} from '@/lib/sequences/draft';
import type { Job } from '@/lib/schemas/job';
import type { Lead } from '@/lib/schemas/lead';

// ---------------------------------------------------------------------------
// Fit scoring — import scoreCandidateJobFit if present; else local fallback
// ---------------------------------------------------------------------------

export interface FitScoreResult {
  score: number;
  reasons?: string[];
  matchedSkills?: string[];
}

function tokenizeSkills(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/[\s,/|;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Minimal skill-overlap scorer used when @/lib/ai/fit-score is unavailable.
 */
export function localSkillOverlapScore(
  candidate: {
    skills?: string[] | null;
    title?: string | null;
    summary?: string | null;
    name?: string | null;
  },
  job: {
    title?: string | null;
    description?: string | null;
    location?: string | null;
  }
): FitScoreResult {
  const jobTokens = new Set([
    ...tokenizeSkills(job.title || ''),
    ...tokenizeSkills(job.description || ''),
  ]);
  // Drop ultra-common words
  const stop = new Set([
    'the', 'and', 'for', 'with', 'you', 'our', 'your', 'will', 'this', 'that',
    'are', 'is', 'to', 'of', 'in', 'a', 'an', 'or', 'as', 'be', 'on', 'we',
    'role', 'job', 'team', 'work', 'experience', 'years', 'looking',
  ]);
  for (const s of stop) jobTokens.delete(s);

  const candSkills = (candidate.skills || []).map((s) => s.toLowerCase().trim());
  const candBlob = [
    ...candSkills,
    ...tokenizeSkills(candidate.title || ''),
    ...tokenizeSkills(candidate.summary || ''),
  ];

  const matched: string[] = [];
  let hits = 0;
  for (const token of candBlob) {
    if (jobTokens.has(token) && !matched.includes(token)) {
      matched.push(token);
      hits += 1;
    }
  }
  // Also check multi-word skill phrases against description
  const desc = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  for (const skill of candSkills) {
    if (skill.length >= 3 && desc.includes(skill) && !matched.includes(skill)) {
      matched.push(skill);
      hits += 1.5;
    }
  }

  const denom = Math.max(6, Math.min(jobTokens.size, 20));
  const raw = Math.min(100, Math.round((hits / denom) * 100));
  // Mild boost if title words overlap
  const titleOverlap = tokenizeSkills(candidate.title || '').some((t) =>
    tokenizeSkills(job.title || '').includes(t)
  );
  const score = Math.min(100, raw + (titleOverlap ? 10 : 0));

  const reasons: string[] = [];
  if (matched.length) {
    reasons.push(`Matched skills/keywords: ${matched.slice(0, 8).join(', ')}`);
  } else {
    reasons.push('Limited keyword overlap with job description');
  }
  if (titleOverlap) reasons.push('Title aligns with job title');

  return { score, reasons, matchedSkills: matched.slice(0, 12) };
}

async function scoreFit(
  candidate: Lead,
  job: Job,
  tenantId?: string
): Promise<FitScoreResult> {
  try {
    // Prefer outcome-aware ranking (placement skills boost)
    if (tenantId) {
      try {
        const outcomeMod = await import('@/lib/ai/outcome-rank');
        const graphMod = await import(
          '@/lib/db/repositories/skills-graph-repository'
        );
        const { graph } = await graphMod.getSkillsGraphFresh(tenantId, {
          rebuild: false,
        });
        const result = outcomeMod.scoreCandidateJobFitWithOutcomes(
          {
            skills: candidate.skills,
            title: candidate.title,
            summary: candidate.summary,
            experience: candidate.experience as any,
            location: candidate.location,
          },
          {
            title: job.title,
            description: job.description,
            location: job.location,
            salaryRange: (job as any).salaryRange,
          },
          graph
        );
        if (result && typeof result.score === 'number') {
          return {
            score: result.score,
            reasons: [
              ...(result.reasons || []),
              ...(result.outcomeBoost
                ? [`Outcome boost +${result.outcomeBoost}`]
                : []),
            ],
            matchedSkills: result.skillsMatched || [],
          };
        }
      } catch {
        /* fall through to base scorer */
      }
    }

    const mod = await import('@/lib/ai/fit-score').catch(() => null);
    if (mod && typeof (mod as any).scoreCandidateJobFit === 'function') {
      const result = await (mod as any).scoreCandidateJobFit(candidate, job);
      if (result && typeof result.score === 'number') {
        return {
          score: result.score,
          reasons: result.reasons || result.rationale || [],
          matchedSkills: result.matchedSkills || result.matched || [],
        };
      }
    }
  } catch {
    /* use local fallback */
  }
  return localSkillOverlapScore(candidate, job);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FillReqOptions {
  maxCandidates?: number;
  enrollSequenceId?: string;
  /** Include Apollo external people search (default true when configured) */
  includeApollo?: boolean;
  apolloLimit?: number;
}

export interface RankedCandidate {
  candidateId: string;
  name: string;
  email?: string;
  title?: string;
  skills?: string[];
  score: number;
  reasons: string[];
  matchedSkills: string[];
  alreadyLinked: boolean;
  source?: 'internal' | 'apollo';
  linkedinUrl?: string;
  company?: string;
  location?: string;
}

export interface ExternalApolloCandidate {
  apolloId: string;
  name: string;
  email?: string;
  title?: string;
  company?: string;
  linkedinUrl?: string;
  location?: string;
  score: number;
  reasons: string[];
}

export interface FillReqDraft {
  candidateId: string;
  candidateName: string;
  subject: string;
  body: string;
  source?: string;
}

export interface FillReqResult {
  job: {
    id: string;
    title: string;
    companyName?: string;
    status?: string;
    linkedCount: number;
  };
  ranked: RankedCandidate[];
  external: ExternalApolloCandidate[];
  drafts: FillReqDraft[];
  nextActions: string[];
  summary: string;
  suggestedSequenceId?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Main playbook (planning + drafts only)
// ---------------------------------------------------------------------------

export async function runFillReqPlaybook(params: {
  tenantId: string;
  userId?: string;
  jobId: string;
  options?: FillReqOptions;
}): Promise<FillReqResult> {
  const { tenantId, jobId, options } = params;
  const maxCandidates = Math.min(
    Math.max(options?.maxCandidates ?? 10, 1),
    50
  );
  const notes: string[] = [];

  // a. Load job
  const job = await getJobById(tenantId, jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  // b. Load linked candidates + all leads
  const linked =
    (Array.isArray(job.candidates) && job.candidates) ||
    (Array.isArray((job as any).linkedCandidates) &&
      (job as any).linkedCandidates) ||
    [];
  const linkedIds = new Set(
    linked.map((c: any) => c.candidateId).filter(Boolean)
  );

  const allLeads = await getAllLeads(tenantId);

  // c + d. Score and rank (prefer unlinked, still include linked with flag)
  const scored: RankedCandidate[] = [];
  for (const lead of allLeads) {
    if (!lead?.id) continue;
    const fit = await scoreFit(lead, job, tenantId);
    scored.push({
      candidateId: lead.id,
      name: lead.name || 'Unknown',
      email: lead.email || undefined,
      title: lead.title || undefined,
      skills: lead.skills || undefined,
      score: fit.score,
      reasons: fit.reasons || [],
      matchedSkills: fit.matchedSkills || [],
      alreadyLinked: linkedIds.has(lead.id),
    });
  }

  // Prefer higher score; unlinked slightly preferred when scores tie
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.alreadyLinked !== b.alreadyLinked) return a.alreadyLinked ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const ranked = scored.slice(0, maxCandidates).map((r) => ({
    ...r,
    source: 'internal' as const,
  }));

  // e. External Apollo people search (when configured)
  const external: ExternalApolloCandidate[] = [];
  const wantApollo = options?.includeApollo !== false;
  if (wantApollo) {
    try {
      const {
        isApolloConfigured,
        searchPeople,
      } = await import('@/lib/apollo/client');
      if (!isApolloConfigured()) {
        notes.push(
          'Apollo not configured (APOLLO_API_KEY) — external sourcing skipped.'
        );
      } else {
        const apolloLimit = Math.min(options?.apolloLimit ?? 8, 15);
        const queryParts = [
          job.title,
          job.location,
          job.companyName ? `not ${job.companyName}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const apolloRes = await searchPeople({
          q: queryParts || job.title || 'software engineer',
          titles: job.title ? [job.title] : undefined,
          locations: job.location ? [job.location] : undefined,
          per_page: apolloLimit,
          page: 1,
        });
        if (apolloRes.error) {
          notes.push(`Apollo search warning: ${apolloRes.error}`);
        }
        const people = apolloRes.people || [];
        for (const p of people) {
          const name =
            p.name ||
            [p.first_name, p.last_name].filter(Boolean).join(' ') ||
            'Unknown';
          const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
          const fit = await scoreFit(
            {
              id: p.id || name,
              name,
              email: p.email,
              title: p.title,
              skills: [],
              summary: p.headline || '',
              location: loc,
            } as Lead,
            job,
            tenantId
          );
          external.push({
            apolloId: p.id || `apollo-${name}`,
            name,
            email: p.email || undefined,
            title: p.title || undefined,
            company: p.company || undefined,
            linkedinUrl: p.linkedin_url || undefined,
            location: loc || undefined,
            score: fit.score,
            reasons: fit.reasons || [],
          });
        }
        external.sort((a, b) => b.score - a.score);
        if (external.length) {
          notes.push(
            `Apollo returned ${external.length} external prospect(s) scored against the JD.`
          );
        } else {
          notes.push('Apollo search returned 0 people for this query.');
        }
      }
    } catch (err: any) {
      notes.push(
        `Apollo search failed: ${err?.message || 'unknown error'} — using internal candidates only.`
      );
    }
  }

  // f. Drafts + sequence suggestion
  let suggestedSequenceId = options?.enrollSequenceId;
  if (!suggestedSequenceId) {
    try {
      const seqs = await listSequences(tenantId);
      const active = seqs.find((s) => s.active);
      suggestedSequenceId = active?.id;
    } catch {
      /* ignore */
    }
  }

  const sequence = suggestedSequenceId
    ? await getSequence(tenantId, suggestedSequenceId)
    : null;

  const drafts: FillReqDraft[] = [];
  for (const r of ranked.slice(0, Math.min(5, ranked.length))) {
    const lead = allLeads.find((l) => l.id === r.candidateId);
    if (!lead) continue;
    try {
      const d = await generateAiFirstDraft({
        candidate: {
          name: lead.name,
          email: lead.email,
          title: lead.title,
          summary: lead.summary,
          skills: lead.skills,
          location: lead.location,
        },
        job: {
          title: job.title,
          companyName: job.companyName,
          description: job.description,
          location: job.location,
        },
        sequence,
        step: sequence?.steps?.[0],
      });
      drafts.push({
        candidateId: r.candidateId,
        candidateName: r.name,
        subject: d.subject,
        body: d.body,
        source: d.source,
      });
    } catch {
      const d = buildFirstTouchDraft({
        candidate: { name: lead.name, skills: lead.skills },
        job: { title: job.title, companyName: job.companyName },
        sequence,
        step: sequence?.steps?.[0],
      });
      drafts.push({
        candidateId: r.candidateId,
        candidateName: r.name,
        subject: d.subject,
        body: d.body,
      });
    }
  }

  const unlinkedTop = ranked.filter((r) => !r.alreadyLinked);
  const nextActions: string[] = [];
  if (unlinkedTop.length) {
    nextActions.push(
      `Review top ${Math.min(5, unlinkedTop.length)} unlinked candidates and link strong fits to the job.`
    );
  }
  if (drafts.length) {
    nextActions.push(
      'Review suggested outreach drafts; send or enroll after confirmation.'
    );
  }
  if (suggestedSequenceId) {
    nextActions.push(
      `Optionally enroll top candidates in sequence ${suggestedSequenceId} (requires confirmation).`
    );
  } else {
    nextActions.push(
      'Create an outreach sequence under Sequences, then enroll top candidates.'
    );
  }
  if (external.length) {
    nextActions.push(
      `Review ${external.length} Apollo external prospect(s) — add strong ones as candidates, then enroll.`
    );
  }
  nextActions.push(
    'When ready, re-run with confirmed actions to link/enroll (executeFillReqActions).'
  );

  const topNames = ranked
    .slice(0, 3)
    .map((r) => `${r.name} (${r.score})`)
    .join(', ');
  const topExt = external
    .slice(0, 2)
    .map((r) => `${r.name} (${r.score})`)
    .join(', ');

  const summary = [
    `Fill-req plan for "${job.title}"${job.companyName ? ` at ${job.companyName}` : ''}.`,
    `${linked.length} candidate(s) already linked; scored ${allLeads.length} internal lead(s).`,
    ranked.length
      ? `Top internal fits: ${topNames}.`
      : 'No internal candidates available to rank.',
    external.length
      ? `Apollo external: ${topExt}${external.length > 2 ? ` +${external.length - 2} more` : ''}.`
      : '',
    'No CRM mutations performed — planning and drafts only.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    job: {
      id: job.id!,
      title: job.title,
      companyName: job.companyName,
      status: typeof job.status === 'string' ? job.status : String(job.status ?? ''),
      linkedCount: linked.length,
    },
    ranked,
    external,
    drafts,
    nextActions,
    summary,
    suggestedSequenceId,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Optional execution after user confirmation
// ---------------------------------------------------------------------------

export interface FillReqAction {
  type: 'link' | 'enroll';
  candidateId: string;
  sequenceId?: string;
  candidateName?: string;
  candidateEmail?: string;
}

export async function executeFillReqActions(params: {
  tenantId: string;
  jobId: string;
  confirmed: boolean;
  actions: FillReqAction[];
}): Promise<{
  performed: Array<{ type: string; candidateId: string; ok: boolean; detail?: string }>;
  skipped: boolean;
  message: string;
}> {
  if (!params.confirmed) {
    return {
      performed: [],
      skipped: true,
      message:
        'Actions not executed — set confirmed: true after the user approves the plan.',
    };
  }

  const job = await getJobById(params.tenantId, params.jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  const performed: Array<{
    type: string;
    candidateId: string;
    ok: boolean;
    detail?: string;
  }> = [];

  for (const action of params.actions || []) {
    if (!action.candidateId) continue;

    if (action.type === 'link') {
      try {
        let name = action.candidateName;
        let email = action.candidateEmail;
        if (!name) {
          const lead = await getLeadById(params.tenantId, action.candidateId);
          name = lead?.name || 'Unknown';
          email = lead?.email || email;
        }
        await linkCandidateToJob(params.tenantId, params.jobId, {
          candidateId: action.candidateId,
          candidateName: name || 'Unknown',
          candidateEmail: email,
          stage: 'sourced',
        });
        performed.push({
          type: 'link',
          candidateId: action.candidateId,
          ok: true,
          detail: `Linked ${name}`,
        });
      } catch (err) {
        performed.push({
          type: 'link',
          candidateId: action.candidateId,
          ok: false,
          detail: err instanceof Error ? err.message : 'link failed',
        });
      }
    }

    if (action.type === 'enroll') {
      try {
        const seqId = action.sequenceId;
        if (!seqId) {
          performed.push({
            type: 'enroll',
            candidateId: action.candidateId,
            ok: false,
            detail: 'sequenceId required',
          });
          continue;
        }
        const lead = await getLeadById(params.tenantId, action.candidateId);
        const enrollment = await enrollCandidate(params.tenantId, {
          sequenceId: seqId,
          candidateId: action.candidateId,
          candidateName: lead?.name || action.candidateName,
          candidateEmail: lead?.email || action.candidateEmail,
          jobId: params.jobId,
          jobTitle: job.title,
        });
        performed.push({
          type: 'enroll',
          candidateId: action.candidateId,
          ok: true,
          detail: `Enrolled ${enrollment.id}`,
        });
      } catch (err) {
        performed.push({
          type: 'enroll',
          candidateId: action.candidateId,
          ok: false,
          detail: err instanceof Error ? err.message : 'enroll failed',
        });
      }
    }
  }

  return {
    performed,
    skipped: false,
    message: `Executed ${performed.filter((p) => p.ok).length}/${performed.length} action(s).`,
  };
}
