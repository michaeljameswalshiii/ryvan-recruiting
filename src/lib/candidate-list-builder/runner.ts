/**
 * Process one batch of a candidate list-builder job via People Data Labs.
 * @serverOnly
 */

import {
  appendCandidateResults,
  getCandidateListBuilderJob,
  setCandidateJobStatus,
  updateCandidateListBuilderJob,
} from '@/lib/db/repositories/candidate-list-builder-repository';
import { getAllLeads } from '@/lib/db/repositories/lead-repository';
import { CANDIDATE_LIST_BUILDER_DEFAULTS } from '@/lib/schemas/candidate-list-builder';
import type {
  CandidateListBuilderJob,
  CandidateListBuilderResultRow,
} from '@/lib/schemas/candidate-list-builder';
import {
  isPdlConfigured,
  searchPeople,
  type PdlNormalizedPerson,
} from '@/lib/pdl/client';
import { logPdlUsage } from '@/lib/aws/athena-bedrock';

function rowId(): string {
  return `crow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidEmail(email?: string): boolean {
  const e = (email || '').trim();
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidPhone(phone?: string): boolean {
  const p = (phone || '').trim();
  const digits = (p.match(/\d/g) || []).length;
  return !!p && digits >= 7 && digits <= 15;
}

export function isKeepableCandidate(r: {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  name?: string;
}): boolean {
  if (!(r.name || '').trim()) return false;
  return (
    isValidEmail(r.email) ||
    isValidPhone(r.phone) ||
    !!(r.linkedinUrl && r.linkedinUrl.includes('linkedin'))
  );
}

function completeness(r: {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}): CandidateListBuilderResultRow['contactCompleteness'] {
  if (isValidEmail(r.email) && isValidPhone(r.phone)) return 'complete';
  if (isValidEmail(r.email) || isValidPhone(r.phone)) return 'partial';
  if (r.linkedinUrl) return 'profile';
  return 'partial';
}

function existingLeadMatch(
  leads: Array<{ id: string; email?: string; linkedin_url?: string; name?: string }>,
  person: PdlNormalizedPerson
): string | undefined {
  const em = (person.email || '').toLowerCase().trim();
  const li = (person.linkedinUrl || '').toLowerCase().trim();
  for (const lead of leads) {
    if (em && (lead.email || '').toLowerCase().trim() === em) return lead.id;
    if (
      li &&
      lead.linkedin_url &&
      (lead.linkedin_url.toLowerCase().includes(li) ||
        li.includes(lead.linkedin_url.toLowerCase()))
    ) {
      return lead.id;
    }
  }
  return undefined;
}

function personToRow(
  person: PdlNormalizedPerson,
  existingLeadId?: string
): CandidateListBuilderResultRow {
  return {
    id: rowId(),
    pdlId: person.pdlId,
    name: person.name,
    firstName: person.firstName,
    lastName: person.lastName,
    title: person.title,
    company: person.company,
    email: person.email,
    phone: person.phone,
    linkedinUrl: person.linkedinUrl,
    city: person.city,
    state: person.state,
    country: person.country,
    location: person.location,
    industry: person.industry,
    skills: person.skills,
    contactCompleteness: completeness(person),
    existingLeadId,
    leadExists: !!existingLeadId,
    selected: !existingLeadId,
    imported: false,
    createdAt: new Date().toISOString(),
  };
}

function stopIfTargetOrTimeout(job: CandidateListBuilderJob): {
  stop: boolean;
  status?: 'awaiting_import' | 'failed';
  message?: string;
} {
  const found = (job.results || []).length;
  if (found >= job.targetSize) {
    return {
      stop: true,
      status: 'awaiting_import',
      message: `Target reached — ${found} candidates ready to review.`,
    };
  }
  if (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now()) {
    return {
      stop: true,
      status: found > 0 ? 'awaiting_import' : 'failed',
      message:
        found > 0
          ? `Time budget ended with ${found} candidates.`
          : 'Timed out before finding candidates.',
    };
  }
  if (
    (job.discoveryBatch || 0) >=
    CANDIDATE_LIST_BUILDER_DEFAULTS.maxDiscoveryBatches
  ) {
    return {
      stop: true,
      status: found > 0 ? 'awaiting_import' : 'failed',
      message:
        found > 0
          ? `Search depth limit — ${found} candidates ready.`
          : 'Search depth limit with no keepable candidates.',
    };
  }
  return { stop: false };
}

/**
 * Run one PDL page for the job. Safe to call from tick / cron / create.
 */
export async function processCandidateListBuilderBatch(
  tenantId: string,
  jobId: string
): Promise<CandidateListBuilderJob | null> {
  const job = await getCandidateListBuilderJob(tenantId, jobId);
  if (!job) return null;

  if (['paused', 'cancelled', 'completed', 'failed', 'awaiting_import'].includes(job.status)) {
    return job;
  }

  // Soft lock
  if (job.lockedUntil && new Date(job.lockedUntil).getTime() > Date.now()) {
    return job;
  }

  const early = stopIfTargetOrTimeout(job);
  if (early.stop) {
    return setCandidateJobStatus(tenantId, jobId, early.status || 'awaiting_import', {
      progress: {
        ...job.progress,
        lastMessage: early.message,
      },
      lockedUntil: undefined,
    });
  }

  if (!isPdlConfigured()) {
    return setCandidateJobStatus(tenantId, jobId, 'failed', {
      error:
        'People Data Labs API key missing. Set PEOPLE_DATA_LABS_API_KEY (AWS Data Exchange or PDL dashboard).',
      progress: {
        ...job.progress,
        lastMessage: 'Failed — PDL API key not configured.',
      },
      lockedUntil: undefined,
    });
  }

  const lockUntil = new Date(
    Date.now() + CANDIDATE_LIST_BUILDER_DEFAULTS.lockMs
  ).toISOString();

  await updateCandidateListBuilderJob(tenantId, jobId, {
    status: 'running',
    startedAt: job.startedAt || new Date().toISOString(),
    lockedUntil: lockUntil,
    progress: {
      ...job.progress,
      lastMessage: 'Querying People Data Labs…',
    },
  });

  const locations = [
    job.geography,
    // Prefer region-style filters already stored on job
  ].filter(Boolean);

  const remaining = Math.max(
    1,
    job.targetSize - (job.results || []).length
  );
  const size = Math.min(
    CANDIDATE_LIST_BUILDER_DEFAULTS.batchSize,
    remaining
  );

  const result = await searchPeople({
    titles: job.titles,
    keywords: job.keywords,
    locations,
    companies: job.companies,
    industries: job.industries,
    size,
    scrollToken: job.progress?.scrollToken,
  });

  // Always log spend for the Usage dashboard (even 0-result pages that still bill 0)
  if (result.people.length > 0 || result.estimatedCostUsd > 0) {
    void logPdlUsage({
      modelId: 'peopledatalabs-person-search',
      resultsCount: result.people.length,
      estimatedCost: result.estimatedCostUsd,
      queryPreview: job.brief,
      latencyMs: result.latencyMs,
      tenantId,
      userId: job.userId,
    }).catch(() => {});
  }

  if (result.error && result.people.length === 0) {
    const errorStreak = (job.progress.errorStreak || 0) + 1;
    const fail =
      errorStreak >= CANDIDATE_LIST_BUILDER_DEFAULTS.maxConsecutiveErrors;
    if (fail) {
      return setCandidateJobStatus(tenantId, jobId, 'failed', {
        error: result.error,
        progress: {
          ...job.progress,
          errorStreak,
          batchesCompleted: (job.progress.batchesCompleted || 0) + 1,
          lastMessage: `Failed — ${result.error}`,
        },
        lockedUntil: undefined,
      });
    }
    return updateCandidateListBuilderJob(tenantId, jobId, {
      status: 'running',
      lockedUntil: undefined,
      discoveryBatch: (job.discoveryBatch || 0) + 1,
      progress: {
        ...job.progress,
        errorStreak,
        batchesCompleted: (job.progress.batchesCompleted || 0) + 1,
        pdlCalls: (job.progress.pdlCalls || 0) + 1,
        estimatedCostUsd:
          (job.progress.estimatedCostUsd || 0) + (result.estimatedCostUsd || 0),
        lastMessage: `PDL error (retry ${errorStreak}): ${result.error}`,
      },
    });
  }

  // Dedupe vs existing CRM + vs rows already on job
  let leads: Array<{
    id: string;
    email?: string;
    linkedin_url?: string;
    name?: string;
  }> = [];
  try {
    const all = await getAllLeads(tenantId);
    leads = all
      .filter((l): l is typeof l & { id: string } => !!l?.id)
      .map((l) => ({
        id: l.id,
        email: l.email,
        linkedin_url: l.linkedin_url,
        name: l.name,
      }));
  } catch {
    leads = [];
  }

  const seenKeys = new Set<string>();
  for (const r of job.results || []) {
    if (r.pdlId) seenKeys.add(`pdl:${r.pdlId}`);
    if (r.email) seenKeys.add(`em:${r.email.toLowerCase()}`);
    if (r.linkedinUrl) seenKeys.add(`li:${r.linkedinUrl.toLowerCase()}`);
  }

  const newRows: CandidateListBuilderResultRow[] = [];
  for (const person of result.people) {
    if (!isKeepableCandidate(person)) continue;
    const keys = [
      person.pdlId && `pdl:${person.pdlId}`,
      person.email && `em:${person.email.toLowerCase()}`,
      person.linkedinUrl && `li:${person.linkedinUrl.toLowerCase()}`,
    ].filter(Boolean) as string[];
    if (keys.some((k) => seenKeys.has(k))) continue;
    for (const k of keys) seenKeys.add(k);

    const existingId = existingLeadMatch(leads, person);
    newRows.push(personToRow(person, existingId));
  }

  const keptThisBatch = newRows.length;
  const emptyBatchStreak =
    keptThisBatch === 0
      ? (job.progress.emptyBatchStreak || 0) + 1
      : 0;

  let updated = await appendCandidateResults(tenantId, jobId, newRows);
  if (!updated) updated = await getCandidateListBuilderJob(tenantId, jobId);
  if (!updated) return null;

  const found = (updated.results || []).length;
  const completeFound = (updated.results || []).filter(
    (r) => r.contactCompleteness === 'complete'
  ).length;
  const partialFound = found - completeFound;

  const progress = {
    ...updated.progress,
    found,
    target: updated.targetSize,
    completeFound,
    partialFound,
    researched: (updated.progress.researched || 0) + result.people.length,
    batchesCompleted: (updated.progress.batchesCompleted || 0) + 1,
    emptyBatchStreak,
    errorStreak: 0,
    scrollToken: result.scrollToken,
    estimatedCostUsd:
      (updated.progress.estimatedCostUsd || 0) + (result.estimatedCostUsd || 0),
    pdlCalls: (updated.progress.pdlCalls || 0) + 1,
    pdlReturned: (updated.progress.pdlReturned || 0) + result.people.length,
    lastMessage:
      keptThisBatch > 0
        ? `+${keptThisBatch} candidates (batch ${(updated.progress.batchesCompleted || 0) + 1}) · ${found}/${updated.targetSize} kept · ~$${(
            (updated.progress.estimatedCostUsd || 0) +
            (result.estimatedCostUsd || 0)
          ).toFixed(2)} PDL`
        : `No new keepable rows this page · quiet ${emptyBatchStreak}`,
  };

  // Exhausted PDL scroll or quiet budget
  const noMorePages = !result.scrollToken || result.people.length === 0;
  const quietStop =
    emptyBatchStreak >= CANDIDATE_LIST_BUILDER_DEFAULTS.maxEmptyBatches;

  if (found >= updated.targetSize) {
    return setCandidateJobStatus(tenantId, jobId, 'awaiting_import', {
      discoveryBatch: (updated.discoveryBatch || 0) + 1,
      progress: {
        ...progress,
        lastMessage: `Target reached — ${found} candidates ready to review.`,
      },
      lockedUntil: undefined,
    });
  }

  if (noMorePages || quietStop) {
    return setCandidateJobStatus(
      tenantId,
      jobId,
      found > 0 ? 'awaiting_import' : 'failed',
      {
        discoveryBatch: (updated.discoveryBatch || 0) + 1,
        progress: {
          ...progress,
          lastMessage:
            found > 0
              ? noMorePages
                ? `PDL results exhausted — ${found} candidates ready.`
                : `Stopped after quiet batches — ${found} candidates ready.`
              : noMorePages
                ? 'PDL returned no matching people for this brief.'
                : 'Stopped after consecutive empty batches.',
        },
        error:
          found === 0
            ? 'No candidates matched. Try a broader title or geography.'
            : undefined,
        lockedUntil: undefined,
      }
    );
  }

  return updateCandidateListBuilderJob(tenantId, jobId, {
    status: 'running',
    discoveryBatch: (updated.discoveryBatch || 0) + 1,
    progress,
    lockedUntil: undefined,
  });
}
