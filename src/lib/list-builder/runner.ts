/**
 * Process one batch of a list-builder job.
 * @serverOnly
 */

import {
  appendResults,
  getListBuilderJob,
  setJobStatus,
  updateListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import { getAllClients } from '@/lib/db/repositories/client-repository';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';
import type {
  ListBuilderJob,
  ListBuilderResultRow,
  ListBuilderSeedRow,
} from '@/lib/schemas/list-builder';
import { completeJson } from './llm-json';
import { fetchPageText } from './fetch-page';

function rowId(): string {
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function domainOf(url?: string): string {
  if (!url) return '';
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return (url || '').toLowerCase().replace(/^www\./, '');
  }
}

function companyMatches(
  clients: any[],
  name: string,
  website?: string
): any | null {
  const n = normName(name);
  const d = domainOf(website);
  for (const c of clients) {
    const cn = normName(c.name || c.companyName || '');
    if (n && cn && (cn === n || cn.includes(n) || n.includes(cn))) return c;
    const cd = domainOf(c.domain || c.website || c.linkedin_url);
    if (d && cd && d === cd) return c;
  }
  return null;
}

function contactExists(company: any, email?: string, name?: string): boolean {
  const contacts = Array.isArray(company?.contacts) ? company.contacts : [];
  const em = (email || '').toLowerCase().trim();
  const nm = normName(name || '');
  return contacts.some((c: any) => {
    if (em && (c.email || '').toLowerCase() === em) return true;
    if (nm && normName(c.name || '') === nm) return true;
    return false;
  });
}

function hasContactSignal(r: {
  contactName?: string;
  email?: string;
  phone?: string;
}): boolean {
  return !!(
    (r.contactName && r.contactName.trim()) ||
    (r.email && r.email.trim()) ||
    (r.phone && r.phone.trim())
  );
}

/** Product rule: only keep rows with both email and phone (name optional). */
function hasEmailAndPhone(r: { email?: string; phone?: string }): boolean {
  const email = (r.email || '').trim();
  const phone = (r.phone || '').trim();
  if (!email || !phone) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  // At least a few digits in phone
  if ((phone.match(/\d/g) || []).length < 7) return false;
  return true;
}

async function discoverCompanies(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<Array<{ companyName: string; website?: string; city?: string }>> {
  const system = `You are a B2B research assistant for a recruiting agency.
Return ONLY valid JSON: an array of objects with keys companyName, website (domain preferred), city.
Never invent emails or phones. Only suggest real-looking companies likely to exist in the geography/industry.
Prefer companies a staffing/recruiting firm would call for hiring needs.
Max ${LIST_BUILDER_DEFAULTS.batchSize} companies. Avoid these names if possible: ${excludeNames.slice(0, 40).join(', ') || '(none)'}`;

  const user = `Brief: ${job.brief}
Industry: ${job.industry || 'not specified'}
Geography: ${job.geography}
Batch #: ${job.discoveryBatch + 1}
Need ${LIST_BUILDER_DEFAULTS.batchSize} more companies (we already have ${job.results.length} of ${job.targetSize}).
JSON array only.`;

  const { data, error } = await completeJson<
    Array<{ companyName?: string; website?: string; city?: string }>
  >(
    system,
    user,
    {
      tenantId: job.tenant_id,
      userId: job.userId,
      jobId: job.id,
      purpose: 'discover',
      queryPreview: job.brief || job.industry || job.geography,
    },
    { timeoutMs: LIST_BUILDER_DEFAULTS.llmTimeoutMs }
  );

  if (error || !Array.isArray(data)) {
    console.warn('[list-builder] discover failed', error);
    // Surface LLM failure to caller via thrown error so error streak increments
    if (error) throw new Error(`discover: ${error}`);
    return [];
  }
  return data
    .map((x) => ({
      companyName: String(x.companyName || '').trim(),
      website: x.website ? String(x.website).trim() : undefined,
      city: x.city ? String(x.city).trim() : undefined,
    }))
    .filter((x) => x.companyName);
}

async function extractFromSite(
  companyName: string,
  website: string,
  page: { title: string; text: string; url: string },
  job?: ListBuilderJob
): Promise<Partial<ListBuilderResultRow>> {
  const system = `Extract public contact info for recruiting BD outreach.
Return ONLY JSON object with optional keys:
contactName, contactTitle, email, phone, city, state, industry, notes
Rules:
- NEVER invent emails or phones. Only include if clearly present in the page text.
- Prefer HR, recruiting, talent, people ops, owner, founder, CEO, office manager.
- If nothing found, return {} or notes explaining what is missing.`;

  const user = `Company: ${companyName}
Website: ${website}
Page title: ${page.title}
Page text (truncated):
${page.text.slice(0, 8000)}`;

  const { data } = await completeJson<Record<string, string>>(
    system,
    user,
    {
      tenantId: job?.tenant_id,
      userId: job?.userId,
      jobId: job?.id,
      purpose: 'extract',
      queryPreview: `${companyName} ${website}`,
    },
    { timeoutMs: LIST_BUILDER_DEFAULTS.llmTimeoutMs }
  );
  if (!data || typeof data !== 'object') return { sourceUrl: page.url };
  const out: Partial<ListBuilderResultRow> = { sourceUrl: page.url };
  for (const k of [
    'contactName',
    'contactTitle',
    'email',
    'phone',
    'city',
    'state',
    'industry',
    'notes',
  ] as const) {
    if (typeof data[k] === 'string' && data[k].trim()) {
      out[k] = data[k].trim();
    }
  }
  // Sanity: reject obviously fake emails
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    delete out.email;
  }
  return out;
}

function seedToCandidates(
  job: ListBuilderJob
): Array<ListBuilderSeedRow & { fromSeed: true }> {
  const start = job.seedCursor || 0;
  const slice = (job.seedRows || []).slice(
    start,
    start + LIST_BUILDER_DEFAULTS.batchSize
  );
  return slice.map((s) => ({ ...s, fromSeed: true as const }));
}

async function recordBatchError(
  tenantId: string,
  jobId: string,
  job: ListBuilderJob,
  err: unknown
): Promise<{ job?: ListBuilderJob; error?: string; done?: boolean }> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[list-builder] batch error', jobId, msg);
  const errorStreak = (job.progress?.errorStreak || 0) + 1;
  if (errorStreak >= LIST_BUILDER_DEFAULTS.maxConsecutiveErrors) {
    const updated = await setJobStatus(tenantId, jobId, 'failed', {
      error: msg,
      lockedUntil: undefined,
      progress: {
        ...job.progress,
        errorStreak,
        lastMessage: `Stopped after ${errorStreak} consecutive errors: ${msg.slice(0, 160)}`,
      },
    });
    return { job: updated || job, error: msg, done: true };
  }
  const updated = await updateListBuilderJob(tenantId, jobId, {
    lockedUntil: undefined,
    progress: {
      ...job.progress,
      errorStreak,
      lastMessage: `Batch error (${errorStreak}/${LIST_BUILDER_DEFAULTS.maxConsecutiveErrors}): ${msg.slice(0, 120)}. Will retry next tick.`,
    },
  });
  return { job: updated || job, error: msg, done: false };
}

/**
 * Advance job by one batch. Safe to call from cron or after create.
 */
export async function processListBuilderBatch(
  tenantId: string,
  jobId: string
): Promise<{ job?: ListBuilderJob; error?: string; done?: boolean }> {
  const job = await getListBuilderJob(tenantId, jobId);
  if (!job) return { error: 'Job not found' };

  if (job.status === 'paused') {
    return { job, done: false };
  }
  if (
    job.status === 'cancelled' ||
    job.status === 'completed' ||
    job.status === 'awaiting_import'
  ) {
    return { job, done: true };
  }
  if (job.status === 'failed') {
    return { job, done: true };
  }

  // Soft lock: another tick/cron is already processing this job
  if (job.lockedUntil && new Date(job.lockedUntil).getTime() > Date.now()) {
    return { job, done: false };
  }

  // Timeout
  if (new Date(job.expiresAt).getTime() < Date.now()) {
    const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...job.progress,
        lastMessage:
          'Stopped: 2-hour time limit reached. Review results and import what you need.',
      },
    });
    return { job: updated || job, done: true };
  }

  if (job.results.length >= job.targetSize) {
    const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...job.progress,
        found: job.results.length,
        emptyBatchStreak: 0,
        errorStreak: 0,
        lastMessage: `Target reached (${job.results.length}/${job.targetSize}). Review and import.`,
      },
    });
    return { job: updated || job, done: true };
  }

  try {
    return await processListBuilderBatchInner(tenantId, jobId, job);
  } catch (err) {
    const fresh = (await getListBuilderJob(tenantId, jobId)) || job;
    return recordBatchError(tenantId, jobId, fresh, err);
  }
}

async function processListBuilderBatchInner(
  tenantId: string,
  jobId: string,
  job: ListBuilderJob
): Promise<{ job?: ListBuilderJob; error?: string; done?: boolean }> {
  const batchStarted = Date.now();
  const lockUntil = new Date(
    batchStarted + LIST_BUILDER_DEFAULTS.batchBudgetMs + 10_000
  ).toISOString();

  await setJobStatus(tenantId, jobId, 'running', {
    lockedUntil: lockUntil,
    progress: {
      ...job.progress,
      lastMessage: 'Researching next batch…',
    },
  });

  const clients = await getAllClients(tenantId);
  const existingNames = job.results.map((r) => r.companyName);

  // Prefer seed rows first
  let candidates: Array<{
    companyName: string;
    website?: string;
    city?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    fromSeed?: boolean;
  }> = seedToCandidates(job);

  let nextSeedCursor = job.seedCursor || 0;
  if (candidates.length > 0) {
    nextSeedCursor = nextSeedCursor + candidates.length;
  } else {
    candidates = await discoverCompanies(job, existingNames);
  }

  if (candidates.length === 0) {
    const emptyBatchStreak = (job.progress?.emptyBatchStreak || 0) + 1;
    const seedsDone =
      (job.seedRows?.length || 0) <= (job.seedCursor || 0);
    const shouldStop =
      emptyBatchStreak >= LIST_BUILDER_DEFAULTS.maxEmptyBatches ||
      (seedsDone && job.discoveryBatch >= 15);

    if (shouldStop) {
      const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
        lockedUntil: undefined,
        progress: {
          ...job.progress,
          emptyBatchStreak,
          errorStreak: 0,
          batchesCompleted: job.progress.batchesCompleted + 1,
          lastMessage:
            job.results.length > 0
              ? `Could not find more complete contacts (email + phone). Review ${job.results.length} result(s) and import.`
              : 'Could not find companies with both email and phone on public pages. Try a CSV seed with contact info, or a narrower brief.',
        },
      });
      return { job: updated || job, done: true };
    }

    await updateListBuilderJob(tenantId, jobId, {
      discoveryBatch: job.discoveryBatch + 1,
      lockedUntil: undefined,
      progress: {
        ...job.progress,
        batchesCompleted: job.progress.batchesCompleted + 1,
        emptyBatchStreak,
        errorStreak: 0,
        lastMessage: `No candidates this batch (${emptyBatchStreak}/${LIST_BUILDER_DEFAULTS.maxEmptyBatches} empty). Retrying next tick…`,
      },
    });
    return {
      job: (await getListBuilderJob(tenantId, jobId)) || job,
      done: false,
    };
  }

  const newRows: ListBuilderResultRow[] = [];
  const now = new Date().toISOString();
  let researchedThisBatch = 0;
  let skippedIncomplete = 0;
  let skippedDuplicate = 0;

  for (const c of candidates) {
    if (Date.now() - batchStarted > LIST_BUILDER_DEFAULTS.batchBudgetMs) {
      console.warn('[list-builder] batch budget reached, finishing early');
      break;
    }
    if (job.results.length + newRows.length >= job.targetSize) break;

    // Skip if already in this job's results
    const already = job.results.some(
      (r) =>
        normName(r.companyName) === normName(c.companyName) ||
        (c.website && domainOf(r.website) === domainOf(c.website))
    );
    if (already) {
      skippedDuplicate++;
      continue;
    }

    researchedThisBatch++;
    const match = companyMatches(clients, c.companyName, c.website);
    let website = c.website;
    if (website && !/^https?:\/\//i.test(website)) {
      website = website.includes('.') ? `https://${website}` : website;
    }

    let extracted: Partial<ListBuilderResultRow> = {};
    if (website && website.includes('.')) {
      const page = await fetchPageText(website);
      if (!('error' in page)) {
        extracted = await extractFromSite(c.companyName, website, page, job);
      } else {
        extracted = { notes: `Site fetch: ${page.error}` };
      }
    }

    // Merge seed-provided contact (trusted as user upload)
    if (c.contactName) extracted.contactName = extracted.contactName || c.contactName;
    if (c.email) extracted.email = extracted.email || c.email;
    if (c.phone) extracted.phone = extracted.phone || c.phone;
    if (c.city) extracted.city = extracted.city || c.city;

    if (match && contactExists(match, extracted.email, extracted.contactName)) {
      // Company + same contact already in Trio — skip row
      skippedDuplicate++;
      continue;
    }

    const row: ListBuilderResultRow = {
      id: rowId(),
      companyName: c.companyName,
      website: website || extracted.sourceUrl,
      city: extracted.city || c.city,
      state: extracted.state,
      industry: extracted.industry || job.industry,
      contactName: extracted.contactName,
      contactTitle: extracted.contactTitle,
      email: extracted.email,
      phone: extracted.phone,
      sourceUrl: extracted.sourceUrl || website,
      existingCompanyId: match?.id ? String(match.id) : undefined,
      companyExists: !!match,
      notes: extracted.notes,
      selected: true,
      createdAt: now,
    };
    // Only surface leads that have both email and phone — never invent; skip incomplete
    if (!hasEmailAndPhone(row)) {
      skippedIncomplete++;
      continue;
    }
    newRows.push(row);
  }

  if (newRows.length) {
    await appendResults(tenantId, jobId, newRows);
  }

  const refreshed = await getListBuilderJob(tenantId, jobId);
  if (!refreshed) return { error: 'Job lost after update' };

  const emptyBatchStreak =
    newRows.length === 0
      ? (job.progress?.emptyBatchStreak || 0) + 1
      : 0;
  const researched =
    (job.progress?.researched || 0) + researchedThisBatch;

  const lastMessage =
    newRows.length > 0
      ? `Kept ${refreshed.results.length}/${job.targetSize} with email+phone (+${newRows.length} this batch; researched ${researchedThisBatch}).`
      : `Researched ${researchedThisBatch}, kept 0 with email+phone` +
        (skippedIncomplete ? ` (${skippedIncomplete} incomplete)` : '') +
        (skippedDuplicate ? `, ${skippedDuplicate} skipped` : '') +
        `. Empty streak ${emptyBatchStreak}/${LIST_BUILDER_DEFAULTS.maxEmptyBatches}.`;

  // Stagnation: many batches with zero keepable rows
  if (
    emptyBatchStreak >= LIST_BUILDER_DEFAULTS.maxEmptyBatches &&
    refreshed.results.length < job.targetSize
  ) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      seedCursor: nextSeedCursor,
      discoveryBatch: job.discoveryBatch + (candidates[0]?.fromSeed ? 0 : 1),
      lockedUntil: undefined,
      progress: {
        found: refreshed.results.length,
        target: job.targetSize,
        batchesCompleted: job.progress.batchesCompleted + 1,
        researched,
        emptyBatchStreak,
        errorStreak: 0,
        lastMessage:
          refreshed.results.length > 0
            ? `Stopped: ${emptyBatchStreak} batches without new complete contacts. Review ${refreshed.results.length} result(s).`
            : `Stopped: researched ${researched} companies but none had both email and phone on public pages. Try a seed CSV or different brief.`,
      },
    });
    return { job: done || refreshed, done: true };
  }

  await updateListBuilderJob(tenantId, jobId, {
    seedCursor: nextSeedCursor,
    discoveryBatch: job.discoveryBatch + (candidates[0]?.fromSeed ? 0 : 1),
    lockedUntil: undefined,
    progress: {
      found: refreshed.results.length,
      target: job.targetSize,
      batchesCompleted: job.progress.batchesCompleted + 1,
      researched,
      emptyBatchStreak,
      errorStreak: 0,
      lastMessage,
    },
  });

  const latest = await getListBuilderJob(tenantId, jobId);
  if (!latest) return { error: 'Job lost' };

  if (latest.results.length >= latest.targetSize) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      lockedUntil: undefined,
      progress: {
        ...latest.progress,
        found: latest.results.length,
        emptyBatchStreak: 0,
        errorStreak: 0,
        lastMessage: `Done — ${latest.results.length} companies ready to review and import.`,
      },
    });
    return { job: done || latest, done: true };
  }

  // Expired mid-batch?
  if (new Date(latest.expiresAt).getTime() < Date.now()) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      lockedUntil: undefined,
      progress: {
        ...latest.progress,
        lastMessage: 'Time limit reached. Review and import current results.',
      },
    });
    return { job: done || latest, done: true };
  }

  return { job: latest, done: false };
}

export { hasContactSignal, hasEmailAndPhone };
