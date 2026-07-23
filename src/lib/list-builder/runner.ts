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
import { parseEmployeeCap, resolveTargetGeography } from './geo';
import {
  discoverCompanyCandidatesWithDiagnostics,
  discoveryStrategyPhase,
  enrichContactFromWeb,
  type DiscoverCandidate,
  type DiscoveryDiagnostics,
} from './discover-sources';
import {
  normalizeIndustry,
  parseEmployeeCount,
  parseOpenJobsPosted,
} from './firmographics';
import {
  evaluateGeoForKeep,
  exceedsSmbSize,
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
  const digits = (p.match(/\d/g) || []).length;
  // 10–11 digit US (or 7+ local) — was too picky when sites omit area code formatting
  return !!p && digits >= 7 && digits <= 15;
}

/** Both email and phone present and well-formed. */
function hasEmailAndPhone(r: { email?: string; phone?: string }): boolean {
  return isValidEmail(r.email) && isValidPhone(r.phone);
}

/**
 * Keep tiers (never invent contacts):
 * - complete: email + phone
 * - partial: email or phone
 * - website: live site + usable for BD when allowWebsiteLeads (happy medium)
 */
function contactCompleteness(
  r: { email?: string; phone?: string },
  opts?: { allowWebsiteLead?: boolean; hasLiveSite?: boolean }
): 'complete' | 'partial' | 'website' | null {
  const em = isValidEmail(r.email);
  const ph = isValidPhone(r.phone);
  if (em && ph) return 'complete';
  if (em || ph) return 'partial';
  if (opts?.allowWebsiteLead && opts?.hasLiveSite) return 'website';
  return null;
}

function isKeepableContact(r: { email?: string; phone?: string }): boolean {
  return contactCompleteness(r) === 'complete' || contactCompleteness(r) === 'partial';
}

function countCompleteness(
  rows: Array<{
    contactCompleteness?: string;
    email?: string;
    phone?: string;
    website?: string;
    siteVerified?: boolean;
  }>
) {
  let completeFound = 0;
  let partialFound = 0;
  for (const r of rows) {
    const c =
      r.contactCompleteness ||
      contactCompleteness(r, {
        allowWebsiteLead: true,
        hasLiveSite: !!(r.siteVerified || r.website),
      }) ||
      null;
    if (c === 'complete') completeFound++;
    else if (c === 'partial' || c === 'website') partialFound++;
  }
  return { completeFound, partialFound, found: completeFound + partialFound };
}

async function discoverCompanies(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<{ candidates: DiscoverCandidate[]; diagnostics: DiscoveryDiagnostics }> {
  // Web directory search + Grok completion + short browse + site hydrate
  return discoverCompanyCandidatesWithDiagnostics(job, excludeNames);
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
      lastMessage: `Researching batch ${(job.discoveryBatch || 0) + 1}…`,
    },
  });

  const clients = await getAllClients(tenantId);
  // Exclude kept results AND already-researched names so we don't re-burn quiet
  // batches on the same dead ends.
  const priorSeen = Array.isArray((job.progress as any)?.seenNames)
    ? ((job.progress as any).seenNames as string[])
    : [];
  const existingNames = [
    ...job.results.map((r) => r.companyName),
    ...priorSeen,
  ];

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
  let lastDiagnostics: DiscoveryDiagnostics | null = null;
  if (candidates.length > 0) {
    nextSeedCursor = nextSeedCursor + candidates.length;
  } else {
    const { candidates: discovered, diagnostics } = await discoverCompanies(
      job,
      existingNames
    );
    lastDiagnostics = diagnostics;
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
    const targetGeoEmpty = resolveTargetGeography(job.brief, job.geography);

    // Stop after N consecutive quiet batches (no new candidates this round)
    if (emptyBatchStreak >= LIST_BUILDER_DEFAULTS.maxEmptyBatches) {
      const updated = await setJobStatus(tenantId, jobId, 'awaiting_import', {
        discoveryBatch: nextBatch,
        lockedUntil: undefined,
        progress: {
          ...job.progress,
          emptyBatchStreak,
          errorStreak: 0,
          batchesCompleted: job.progress.batchesCompleted + 1,
          lastMessage:
            job.results.length > 0
              ? `Stopped after ${emptyBatchStreak} quiet batches — review ${job.results.length}/${job.targetSize} kept in ${targetGeoEmpty}.`
              : `Stopped after ${emptyBatchStreak} quiet batches with no usable leads in ${targetGeoEmpty}. Try a narrower brief or CSV seed.`,
        },
      });
      return { job: updated || job, done: true };
    }

    // Safety-stop: discovery batch cap
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

    const diag = lastDiagnostics;
    const diagBit = diag
      ? ` · sources: catalog ${diag.catalogCount ?? 0}, web ${diag.webSearchCount}, grok ${diag.completionCount}, live ${diag.afterHydrate}` +
        (diag.notes.length ? ` (${diag.notes.slice(0, 2).join('; ')})` : '')
      : '';

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
          const remain =
            LIST_BUILDER_DEFAULTS.maxEmptyBatches - emptyBatchStreak;
          return (
            `No new companies this batch — still targeting ${targetGeoEmpty}. ` +
            `${job.results.length}/${job.targetSize} kept · quiet ${emptyBatchStreak}/${LIST_BUILDER_DEFAULTS.maxEmptyBatches}` +
            (remain > 0 ? ` · stops after ${remain} more empty` : '') +
            ` · retrying…${relax}${diagBit}`
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
  let skippedTooBig = 0;
  let keptComplete = 0;
  let keptPartial = 0;
  let keptVerified = 0;

  const targetGeoCheck = resolveTargetGeography(job.brief, job.geography);
  const geoPhase = discoveryStrategyPhase(job);
  // Catalog/seed firms often list HQ metros elsewhere while serving the target —
  // allow unknown geo always so we don't discard every reachable site.
  // Still reject hard off-target when page evidence is clearly wrong state.
  const allowUnknownGeo = true;

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

    // Catalog/seed rows often already carry city+website — count as researched even
    // before contact scrape so UI counters move on every tick.

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

    // Size: only hard-drop when brief names a cap AND we know they're far above it
    // (e.g. "under 300") — don't discard mid-market firms with unknown headcount
    const briefCap = parseEmployeeCap(job.brief);
    const sizeCap = briefCap && briefCap > 0 ? Math.max(briefCap * 2, 500) : 2500;
    const sizeCheck = exceedsSmbSize(
      extracted.employeeCount || c.employeeCount,
      extracted.companySize || c.companySize,
      sizeCap
    );
    // Only drop when headcount is known and clearly huge; skip when size unknown
    if (
      sizeCheck.tooBig &&
      (typeof (extracted.employeeCount || c.employeeCount) === 'number' ||
        /\d{3,}/.test(String(extracted.companySize || c.companySize || '')))
    ) {
      skippedTooBig++;
      continue;
    }

    if (match && contactExists(match, extracted.email, extracted.contactName)) {
      skippedDuplicate++;
      continue;
    }

    // Happy medium: keep email/phone when found; also keep live local sites as
    // "website" leads (importable companies) so keep-rate isn't ~5%.
    const completeness = contactCompleteness(
      { email: extracted.email, phone: extracted.phone },
      { allowWebsiteLead: true, hasLiveSite: siteVerified }
    );
    if (!completeness) {
      skippedNoContact++;
      continue;
    }

    const geoVerified =
      geoEval.geoVerified || !!(c as any).geoVerified || false;
    const hasContact = completeness === 'complete' || completeness === 'partial';
    const verificationStatus = tierFromFlags(
      siteVerified,
      geoVerified,
      hasContact
    );
    // Website-only rows: still keep if site is live (tier may be partial/unverified)
    if (!siteVerified && verificationStatus === 'unverified') {
      skippedDeadSite++;
      continue;
    }

    if (completeness === 'complete') keptComplete++;
    else keptPartial++;
    if (verificationStatus === 'verified') keptVerified++;

    const verifyNote = [
      siteVerified ? 'Site OK' : 'Site unchecked',
      geoVerified ? 'Geo OK' : 'Geo unconfirmed',
      completeness === 'website' ? 'Website lead (no public email/phone yet)' : null,
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
      verificationStatus:
        completeness === 'website' && verificationStatus === 'unverified'
          ? 'partial'
          : verificationStatus,
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
      // Auto-select rows with any contact; website-only stays unchecked for review
      selected: hasContact && (verificationStatus === 'verified' || verificationStatus === 'partial'),
      createdAt: now,
    };
    newRows.push(row);
  }

  if (newRows.length) {
    await appendResults(tenantId, jobId, newRows);
  }

  const refreshed = await getListBuilderJob(tenantId, jobId);
  if (!refreshed) return { error: 'Job lost after update' };

  // Quiet = no NEW keeps. But if we still researched companies this tick,
  // do not burn quiet budget as fast (filter misses ≠ discovery dry).
  // Full quiet only when we had nothing to research OR zero research progress.
  let emptyBatchStreak = 0;
  if (newRows.length > 0) {
    emptyBatchStreak = 0;
  } else if (researchedThisBatch === 0) {
    // True dry: no candidates / nothing researched
    emptyBatchStreak = (job.progress?.emptyBatchStreak || 0) + 2;
  } else {
    // Researched but all filtered — slower quiet burn
    emptyBatchStreak = (job.progress?.emptyBatchStreak || 0) + 1;
  }
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
        (skippedNoContact ? ` · ${skippedNoContact} no contact/site keep` : '') +
        (skippedDeadSite ? ` · ${skippedDeadSite} dead site` : '') +
        (skippedOffGeo ? ` · ${skippedOffGeo} off-geo` : '') +
        (skippedTooBig ? ` · ${skippedTooBig} too large` : '') +
        (skippedDuplicate ? ` · ${skippedDuplicate} duplicate` : '') +
        `${sourceBit}${stratBit} · ${totals.found}/${job.targetSize} total` +
        (emptyBatchStreak > 0
          ? ` · quiet ${emptyBatchStreak}/${LIST_BUILDER_DEFAULTS.maxEmptyBatches}`
          : '') +
        ' · continuing…';

  // Stop after N consecutive batches with zero new keeps
  if (
    emptyBatchStreak >= LIST_BUILDER_DEFAULTS.maxEmptyBatches &&
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
        lastMessage:
          totals.found > 0
            ? `Stopped after ${emptyBatchStreak} quiet batches — review ${totals.found}/${job.targetSize} kept in ${targetGeo}.`
            : `Stopped after ${emptyBatchStreak} quiet batches with no usable leads in ${targetGeo}. Try a narrower brief or CSV seed.`,
      },
    });
    return { job: done || refreshed, done: true };
  }

  // Safety: discovery batch cap (primary stops = target size + quiet batches + 2h)
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

  const seenNames = [
    ...new Set([
      ...priorSeen,
      ...job.results.map((r) => r.companyName),
      ...candidates.map((c) => c.companyName).filter(Boolean),
    ]),
  ].slice(-400);

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
      seenNames,
    } as any,
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
