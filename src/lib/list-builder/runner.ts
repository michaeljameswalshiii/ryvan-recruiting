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
import {
  extractContactSignals,
  fetchCompanyContactPages,
} from './fetch-page';
import { resolveTargetGeography } from './geo';
import {
  discoverCompanyCandidates,
  discoveryStrategyPhase,
  enrichContactFromWeb,
  type DiscoverCandidate,
} from './discover-sources';
import {
  normalizeIndustry,
  parseEmployeeCount,
  parseOpenJobsPosted,
} from './firmographics';
import {
  evaluateGeoForKeep,
  tierFromFlags,
  verifyWebsiteReachable,
} from './verify';

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

function isValidEmail(email?: string): boolean {
  const e = (email || '').trim();
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidPhone(phone?: string): boolean {
  const p = (phone || '').trim();
  return !!p && (p.match(/\d/g) || []).length >= 7;
}

/** Both email and phone present and well-formed. */
function hasEmailAndPhone(r: { email?: string; phone?: string }): boolean {
  return isValidEmail(r.email) && isValidPhone(r.phone);
}

/**
 * Keepable lead: at least one of email or phone (never invent).
 * complete = both; partial = only one.
 */
function contactCompleteness(r: {
  email?: string;
  phone?: string;
}): 'complete' | 'partial' | null {
  const em = isValidEmail(r.email);
  const ph = isValidPhone(r.phone);
  if (em && ph) return 'complete';
  if (em || ph) return 'partial';
  return null;
}

function isKeepableContact(r: { email?: string; phone?: string }): boolean {
  return contactCompleteness(r) !== null;
}

function countCompleteness(rows: Array<{ contactCompleteness?: string; email?: string; phone?: string }>) {
  let completeFound = 0;
  let partialFound = 0;
  for (const r of rows) {
    const c =
      r.contactCompleteness ||
      contactCompleteness(r) ||
      null;
    if (c === 'complete') completeFound++;
    else if (c === 'partial') partialFound++;
  }
  return { completeFound, partialFound, found: completeFound + partialFound };
}

async function discoverCompanies(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<DiscoverCandidate[]> {
  // Multi-source: Apollo → Tavily → LLM (grounded). Strict geo — no off-target fallback.
  return discoverCompanyCandidates(job, excludeNames);
}

async function extractFromSite(
  companyName: string,
  website: string,
  page: { title: string; text: string; url: string },
  job?: ListBuilderJob
): Promise<Partial<ListBuilderResultRow>> {
  const system = `Extract public company + contact info for recruiting BD outreach.
Return ONLY JSON object with optional keys:
contactName, contactTitle, email, phone, city, state, industry,
employeeCount (number), companySize (string band like "51-200"), openJobsPosted (number), notes
Rules:
- NEVER invent emails, phones, headcount, or open job counts. Only include if clearly present in the page text.
- Prefer HR, recruiting, talent, people ops, owner, founder, CEO, office manager.
- industry: short sector label if stated (e.g. commercial construction).
- employeeCount / companySize: only from explicit "employees", "team of N", about-us stats.
- openJobsPosted: only if careers/jobs page lists a count or you can count distinct open roles on the page.
- If nothing found, return {} or notes explaining what is missing.`;

  const user = `Company: ${companyName}
Website: ${website}
Page title: ${page.title}
Page text (truncated):
${page.text.slice(0, 8000)}`;

  // Deterministic scrape first (fast, no inventing)
  const signals = extractContactSignals(page.text);
  const out: Partial<ListBuilderResultRow> = { sourceUrl: page.url };
  if (signals.emails[0]) out.email = signals.emails[0];
  if (signals.phones[0]) out.phone = signals.phones[0];

  // LLM for name/title/city when useful — skip if we already have email+phone
  // and page is short (saves time budget for more companies)
  const needLlm = !out.email || !out.phone || page.text.length > 400;
  if (needLlm) {
    const { data } = await completeJson<Record<string, string | number>>(
      system,
      user,
      {
        tenantId: job?.tenant_id,
        userId: job?.userId,
        jobId: job?.id,
        purpose: 'extract',
        queryPreview: `${companyName} ${website}`,
      },
      { timeoutMs: Math.min(LIST_BUILDER_DEFAULTS.llmTimeoutMs, 18_000) }
    );
    if (data && typeof data === 'object') {
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
        const v = data[k];
        if (typeof v === 'string' && v.trim()) {
          // Prefer regex-found email/phone over model (less hallucination risk)
          if ((k === 'email' || k === 'phone') && out[k]) continue;
          out[k] = v.trim();
        }
      }
      const size = parseEmployeeCount(
        data.employeeCount ?? data.companySize ?? (data as any).employees
      );
      if (size.employeeCount) out.employeeCount = size.employeeCount;
      if (size.companySize) out.companySize = size.companySize;
      const jobs = parseOpenJobsPosted(
        data.openJobsPosted ?? (data as any).open_jobs_posted
      );
      if (jobs != null) out.openJobsPosted = jobs;
      if (out.industry) out.industry = normalizeIndustry(out.industry);
    }
  }

  // Prefer regex signals if model left gaps
  if (!out.email && signals.emails[0]) out.email = signals.emails[0];
  if (!out.phone && signals.phones[0]) out.phone = signals.phones[0];

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
    batchStarted + LIST_BUILDER_DEFAULTS.lockMs
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
    state?: string;
    contactName?: string;
    contactTitle?: string;
    email?: string;
    phone?: string;
    industry?: string;
    employeeCount?: number;
    companySize?: string;
    openJobsPosted?: number;
    fromSeed?: boolean;
    source?: string;
    siteVerified?: boolean;
    geoVerified?: boolean;
    pageTextSnippet?: string;
  }> = seedToCandidates(job);

  let nextSeedCursor = job.seedCursor || 0;
  if (candidates.length > 0) {
    nextSeedCursor = nextSeedCursor + candidates.length;
  } else {
    const discovered = await discoverCompanies(job, existingNames);
    candidates = discovered.map((d) => {
      const size =
        d.employeeCount || d.companySize
          ? {
              employeeCount: d.employeeCount,
              companySize: d.companySize,
            }
          : parseEmployeeCount(d.employees);
      return {
        companyName: d.companyName,
        website: d.website,
        city: d.city,
        state: d.state,
        email: d.email,
        phone: d.phone,
        industry: d.industry,
        employeeCount: size.employeeCount ?? d.employeeCount,
        companySize: size.companySize ?? d.companySize,
        openJobsPosted: d.openJobsPosted,
        contactName: d.contactName,
        contactTitle: d.contactTitle,
        source: d.source,
        siteVerified: d.siteVerified,
        geoVerified: d.geoVerified,
        pageTextSnippet: d.pageTextSnippet,
      };
    });
  }

  if (candidates.length === 0) {
    const emptyBatchStreak = (job.progress?.emptyBatchStreak || 0) + 1;
    const nextBatch = job.discoveryBatch + 1;
    // Only safety-stop: discovery batch cap (target + 2h timeout are primary)
    if (nextBatch >= LIST_BUILDER_DEFAULTS.maxDiscoveryBatches) {
      const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
        lockedUntil: undefined,
        progress: {
          ...job.progress,
          emptyBatchStreak,
          errorStreak: 0,
          batchesCompleted: job.progress.batchesCompleted + 1,
          lastMessage:
            job.results.length > 0
              ? `Reached discovery limit. Review ${job.results.length} usable lead(s) (target was ${job.targetSize}).`
              : 'Reached discovery limit without usable contacts. Try a CSV seed or narrower brief.',
        },
      });
      return { job: updated || job, done: true };
    }

    await updateListBuilderJob(tenantId, jobId, {
      discoveryBatch: nextBatch,
      lockedUntil: undefined,
      progress: {
        ...job.progress,
        batchesCompleted: job.progress.batchesCompleted + 1,
        emptyBatchStreak,
        errorStreak: 0,
        lastMessage: (() => {
          const nextPhase = discoveryStrategyPhase({
            ...job,
            discoveryBatch: nextBatch,
            progress: {
              ...job.progress,
              emptyBatchStreak,
            },
          });
          const relax =
            nextPhase === 0
              ? ''
              : nextPhase === 1
                ? ' · next batch auto-drops headcount filter'
                : ' · next batch prioritizes public directories + main phones';
          return (
            `No new companies this batch — still targeting ${resolveTargetGeography(job.brief, job.geography)}. ` +
            `${job.results.length}/${job.targetSize} kept · retrying…${relax}`
          );
        })(),
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
  let skippedNoContact = 0;
  let skippedOffGeo = 0;
  let skippedDuplicate = 0;
  let skippedDeadSite = 0;
  let keptComplete = 0;
  let keptPartial = 0;
  let keptVerified = 0;

  const targetGeoCheck = resolveTargetGeography(job.brief, job.geography);
  const geoPhase = discoveryStrategyPhase(job);
  // Never fully skip geo: phase 2 still rejects off-target page/city evidence.
  // Only allow unknown geo (partial) after phase 1+.
  const allowUnknownGeo = geoPhase >= 1;

  for (const c of candidates) {
    if (Date.now() - batchStarted > LIST_BUILDER_DEFAULTS.batchBudgetMs) {
      console.warn('[list-builder] batch budget reached, finishing early');
      break;
    }
    if (job.results.length + newRows.length >= job.targetSize) break;

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

    // --- P0: require live website ---
    let siteVerified = !!(c as any).siteVerified;
    let pageText =
      typeof (c as any).pageTextSnippet === 'string'
        ? String((c as any).pageTextSnippet)
        : '';

    if (!website || !website.includes('.')) {
      skippedDeadSite++;
      continue;
    }

    if (!siteVerified) {
      const reach = await verifyWebsiteReachable(website);
      if (!reach.ok) {
        skippedDeadSite++;
        continue;
      }
      siteVerified = true;
      website = reach.finalUrl || website;
    }

    let extracted: Partial<ListBuilderResultRow> = {};
    if (c.email) extracted.email = c.email;
    if (c.phone) extracted.phone = c.phone;
    if (c.city) extracted.city = c.city;
    if (c.state) extracted.state = c.state;
    if (c.industry) extracted.industry = normalizeIndustry(c.industry);
    if (c.employeeCount) extracted.employeeCount = c.employeeCount;
    if (c.companySize) extracted.companySize = c.companySize;
    if (c.openJobsPosted != null) extracted.openJobsPosted = c.openJobsPosted;
    if (c.contactName) extracted.contactName = c.contactName;
    if (c.contactTitle) extracted.contactTitle = c.contactTitle;

    const alreadyKeepable = isKeepableContact({
      email: extracted.email,
      phone: extracted.phone,
    });

    // Always prefer multi-page crawl when we need contacts or geo text
    if (website && website.includes('.') && (!alreadyKeepable || !pageText)) {
      const page = await fetchCompanyContactPages(website);
      if (!('error' in page)) {
        pageText = page.text || pageText;
        const siteExtract = await extractFromSite(
          c.companyName,
          website,
          page,
          job
        );
        extracted = {
          ...siteExtract,
          email: siteExtract.email || extracted.email,
          phone: siteExtract.phone || extracted.phone,
          city: siteExtract.city || extracted.city,
          state: siteExtract.state || extracted.state,
          industry: siteExtract.industry || extracted.industry,
          employeeCount: siteExtract.employeeCount || extracted.employeeCount,
          companySize: siteExtract.companySize || extracted.companySize,
          openJobsPosted:
            siteExtract.openJobsPosted ?? extracted.openJobsPosted,
          contactName: siteExtract.contactName || extracted.contactName,
          contactTitle: siteExtract.contactTitle || extracted.contactTitle,
          notes: siteExtract.notes || extracted.notes,
          sourceUrl: siteExtract.sourceUrl || website,
        };
        website = page.url || website;
      } else {
        extracted.notes = extracted.notes || `Site fetch: ${page.error}`;
      }
    } else if (website) {
      extracted.sourceUrl = website;
    }

    if (c.contactName) extracted.contactName = extracted.contactName || c.contactName;
    if (c.contactTitle) {
      extracted.contactTitle = extracted.contactTitle || c.contactTitle;
    }
    if (c.email) extracted.email = extracted.email || c.email;
    if (c.phone) extracted.phone = extracted.phone || c.phone;
    if (c.city) extracted.city = extracted.city || c.city;

    if (!isKeepableContact({ email: extracted.email, phone: extracted.phone })) {
      if (Date.now() - batchStarted < LIST_BUILDER_DEFAULTS.batchBudgetMs - 10_000) {
        const web = await enrichContactFromWeb(
          c.companyName,
          extracted.city || c.city,
          website,
          {
            userId: job.userId,
            tenantId: job.tenant_id,
            jobId: job.id,
          }
        );
        if (web.email) extracted.email = extracted.email || web.email;
        if (web.phone) extracted.phone = extracted.phone || web.phone;
        if (web.contactName) {
          extracted.contactName = extracted.contactName || web.contactName;
        }
        if (web.notes) {
          extracted.notes = [extracted.notes, web.notes].filter(Boolean).join(' · ');
        }
      }
    }

    // --- P0: geo from city field + page content (never skip off-target) ---
    const geoEval = evaluateGeoForKeep({
      city: extracted.city || c.city,
      state: extracted.state || c.state,
      companyName: c.companyName,
      targetGeo: targetGeoCheck,
      pageText,
      allowUnknownGeo,
    });
    if (!geoEval.keep) {
      skippedOffGeo++;
      continue;
    }
    // If city field wrong but page is local, prefer page-local note
    if (geoEval.pageGeo?.inTarget && geoEval.geoVerified) {
      // keep city if already local; else leave as-is
    }

    if (match && contactExists(match, extracted.email, extracted.contactName)) {
      skippedDuplicate++;
      continue;
    }

    const completeness = contactCompleteness({
      email: extracted.email,
      phone: extracted.phone,
    });
    if (!completeness) {
      skippedNoContact++;
      continue;
    }

    const geoVerified =
      geoEval.geoVerified || !!(c as any).geoVerified || false;
    const verificationStatus = tierFromFlags(
      siteVerified,
      geoVerified,
      true
    );
    // Do not keep unverified (no site) — already enforced; tier is verified|partial
    if (verificationStatus === 'unverified') {
      skippedDeadSite++;
      continue;
    }

    if (completeness === 'complete') keptComplete++;
    else keptPartial++;
    if (verificationStatus === 'verified') keptVerified++;

    const verifyNote = [
      siteVerified ? 'Site OK' : 'Site unchecked',
      geoVerified ? 'Geo OK' : 'Geo unconfirmed',
      geoEval.reason,
    ]
      .filter(Boolean)
      .join(' · ');

    const row: ListBuilderResultRow = {
      id: rowId(),
      companyName: c.companyName,
      website: website || extracted.sourceUrl,
      city: extracted.city || c.city,
      state: extracted.state || c.state,
      siteVerified,
      geoVerified,
      verificationStatus,
      verificationNotes: verifyNote,
      industry:
        normalizeIndustry(extracted.industry || c.industry || job.industry) ||
        undefined,
      employeeCount: extracted.employeeCount || c.employeeCount,
      companySize: extracted.companySize || c.companySize,
      openJobsPosted: extracted.openJobsPosted ?? c.openJobsPosted,
      contactName: extracted.contactName,
      contactTitle: extracted.contactTitle,
      email: extracted.email,
      phone: extracted.phone,
      sourceUrl: extracted.sourceUrl || website,
      existingCompanyId: match?.id ? String(match.id) : undefined,
      companyExists: !!match,
      notes: [extracted.notes, verifyNote].filter(Boolean).join(' · '),
      contactCompleteness: completeness,
      // Default select only fully verified (site + geo + contact)
      selected: verificationStatus === 'verified',
      createdAt: now,
    };
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
  const totals = countCompleteness(refreshed.results || []);

  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const nextDiscovery =
    job.discoveryBatch + (candidates[0]?.fromSeed ? 0 : 1);

  const sources = candidates
    .map((c) => c.source)
    .filter(Boolean)
    .slice(0, 4);
  const sourceBit =
    sources.length > 0
      ? ` via ${[...new Set(sources)].join('+')}`
      : candidates[0]?.fromSeed
        ? ' via seed'
        : '';

  const stratPhase = discoveryStrategyPhase(job);
  const stratBit =
    stratPhase === 0
      ? ''
      : stratPhase === 1
        ? ' · auto-relaxed (no headcount filter)'
        : ' · auto-relaxed (public directories + main phones)';

  const lastMessage =
    newRows.length > 0
      ? `Kept ${totals.found}/${job.targetSize} in ${targetGeo} (` +
        `${totals.completeFound} complete, ${totals.partialFound} partial` +
        (keptVerified ? `, ${keptVerified} verified` : '') +
        `)` +
        ` · +${newRows.length} this batch` +
        ` · researched ${researchedThisBatch}${sourceBit}${stratBit}.`
      : `Researched ${researchedThisBatch} in ${targetGeo}, kept 0` +
        (skippedNoContact ? ` (${skippedNoContact} no public email/phone)` : '') +
        (skippedDeadSite ? ` (${skippedDeadSite} dead/missing site)` : '') +
        (skippedOffGeo ? ` (${skippedOffGeo} off-geo)` : '') +
        (skippedDuplicate ? `, ${skippedDuplicate} skipped` : '') +
        `${sourceBit}${stratBit} · ${totals.found}/${job.targetSize} total · continuing until target or time limit…`;

  // Safety: discovery batch cap (primary stops = target size + 2h expiresAt)
  if (
    nextDiscovery >= LIST_BUILDER_DEFAULTS.maxDiscoveryBatches &&
    refreshed.results.length < job.targetSize
  ) {
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      seedCursor: nextSeedCursor,
      discoveryBatch: nextDiscovery,
      lockedUntil: undefined,
      progress: {
        found: totals.found,
        target: job.targetSize,
        batchesCompleted: job.progress.batchesCompleted + 1,
        researched,
        completeFound: totals.completeFound,
        partialFound: totals.partialFound,
        emptyBatchStreak,
        errorStreak: 0,
        lastMessage: `Reached discovery limit with ${totals.found}/${job.targetSize} usable leads in ${targetGeo}. Review and import.`,
      },
    });
    return { job: done || refreshed, done: true };
  }

  await updateListBuilderJob(tenantId, jobId, {
    seedCursor: nextSeedCursor,
    discoveryBatch: nextDiscovery,
    lockedUntil: undefined,
    progress: {
      found: totals.found,
      target: job.targetSize,
      batchesCompleted: job.progress.batchesCompleted + 1,
      researched,
      completeFound: totals.completeFound,
      partialFound: totals.partialFound,
      emptyBatchStreak,
      errorStreak: 0,
      lastMessage,
    },
  });

  const latest = await getListBuilderJob(tenantId, jobId);
  if (!latest) return { error: 'Job lost' };

  // Primary success stop: enough usable (email or phone) leads to display
  if (latest.results.length >= latest.targetSize) {
    const endTotals = countCompleteness(latest.results || []);
    const done = await setJobStatus(tenantId, jobId, 'awaiting_import', {
      lockedUntil: undefined,
      progress: {
        ...latest.progress,
        found: endTotals.found,
        completeFound: endTotals.completeFound,
        partialFound: endTotals.partialFound,
        emptyBatchStreak: 0,
        errorStreak: 0,
        lastMessage: `Done — ${endTotals.found}/${latest.targetSize} usable companies in ${targetGeo} (${endTotals.completeFound} complete, ${endTotals.partialFound} partial).`,
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

export {
  hasContactSignal,
  hasEmailAndPhone,
  isKeepableContact,
  contactCompleteness,
  isValidEmail,
  isValidPhone,
  countCompleteness,
};

// Re-export geo helpers for callers that imported from runner
export { resolveTargetGeography, looksInTargetArea } from './geo';
