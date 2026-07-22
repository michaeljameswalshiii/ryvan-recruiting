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
  >(system, user);

  if (error || !Array.isArray(data)) {
    console.warn('[list-builder] discover failed', error);
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
  page: { title: string; text: string; url: string }
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

  const { data } = await completeJson<Record<string, string>>(system, user);
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
  if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'awaiting_import') {
    return { job, done: true };
  }
  if (job.status === 'failed') {
    return { job, done: true };
  }

  // Timeout
  if (new Date(job.expiresAt).getTime() < Date.now()) {
    const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...job.progress,
        lastMessage: 'Stopped: 2-hour time limit reached. Review results and import what you need.',
      },
    });
    return { job: updated || job, done: true };
  }

  if (job.results.length >= job.targetSize) {
    const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...job.progress,
        found: job.results.length,
        lastMessage: `Target reached (${job.results.length}/${job.targetSize}). Review and import.`,
      },
    });
    return { job: updated || job, done: true };
  }

  await setJobStatus(tenantId, jobId, 'running', {
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
    // No more progress possible
    if ((job.seedRows?.length || 0) <= (job.seedCursor || 0) && job.discoveryBatch >= 15) {
      const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
        progress: {
          ...job.progress,
          lastMessage:
            'Could not find more companies. Review what we found and import.',
        },
      });
      return { job: updated || job, done: true };
    }
    await updateListBuilderJob(tenantId, jobId, {
      discoveryBatch: job.discoveryBatch + 1,
      progress: {
        ...job.progress,
        batchesCompleted: job.progress.batchesCompleted + 1,
        lastMessage: 'Batch empty — will try another approach next tick.',
      },
    });
    return { job: await getListBuilderJob(tenantId, jobId) || job, done: false };
  }

  const newRows: ListBuilderResultRow[] = [];
  const now = new Date().toISOString();

  for (const c of candidates) {
    if (job.results.length + newRows.length >= job.targetSize) break;

    // Skip if already in this job's results
    const already = job.results.some(
      (r) =>
        normName(r.companyName) === normName(c.companyName) ||
        (c.website && domainOf(r.website) === domainOf(c.website))
    );
    if (already) continue;

    const match = companyMatches(clients, c.companyName, c.website);
    let website = c.website;
    if (website && !/^https?:\/\//i.test(website)) {
      website = website.includes('.') ? `https://${website}` : website;
    }

    let extracted: Partial<ListBuilderResultRow> = {};
    if (website && website.includes('.')) {
      const page = await fetchPageText(website);
      if (!('error' in page)) {
        extracted = await extractFromSite(c.companyName, website, page);
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
    newRows.push(row);
  }

  if (newRows.length) {
    await appendResults(tenantId, jobId, newRows);
  }

  const refreshed = await getListBuilderJob(tenantId, jobId);
  if (!refreshed) return { error: 'Job lost after update' };

  await updateListBuilderJob(tenantId, jobId, {
    seedCursor: nextSeedCursor,
    discoveryBatch: job.discoveryBatch + (candidates[0]?.fromSeed ? 0 : 1),
    progress: {
      found: refreshed.results.length,
      target: job.targetSize,
      batchesCompleted: job.progress.batchesCompleted + 1,
      lastMessage: `Found ${refreshed.results.length}/${job.targetSize} companies (last batch +${newRows.length}).`,
    },
  });

  const latest = await getListBuilderJob(tenantId, jobId);
  if (!latest) return { error: 'Job lost' };

  if (latest.results.length >= latest.targetSize) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...latest.progress,
        found: latest.results.length,
        lastMessage: `Done — ${latest.results.length} companies ready to review and import.`,
      },
    });
    return { job: done || latest, done: true };
  }

  // Expired mid-batch?
  if (new Date(latest.expiresAt).getTime() < Date.now()) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      progress: {
        ...latest.progress,
        lastMessage: 'Time limit reached. Review and import current results.',
      },
    });
    return { job: done || latest, done: true };
  }

  return { job: latest, done: false };
}

export { hasContactSignal };
