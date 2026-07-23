/**
 * Company discovery for list-builder.
 *
 * Architecture (after 0-kept failure analysis):
 * 1. DuckDuckGo HTML search — real SERP links (no Apollo/Tavily key)
 * 2. Grok completion on Mantle — name local firms + websites from knowledge
 * 3. Optional short Grok+fetch_website browse only if still thin
 * 4. Hydrate: live-site check + contact crawl (budget-capped)
 *
 * Critical: Vercel maxDuration is 60s. Never spend ~50s on browse-only
 * before producing candidates (that left researched=0 forever).
 * @serverOnly
 */

import {
  inferIndustryKeywords,
  looksInTargetArea,
  parseEmployeeCap,
  resolveTargetGeography,
  searchAnchorCities,
} from './geo';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';
import type { ListBuilderJob } from '@/lib/schemas/list-builder';
import {
  extractContactSignals,
  fetchCompanyContactPages,
} from './fetch-page';
import {
  grokWebResearch,
  parseJsonFromText,
  resolveGrokApiKey,
} from './grok-search';
import { grokBrowseResearch } from './grok-browse';
import {
  normalizeIndustry,
  parseEmployeeCount,
  parseOpenJobsPosted,
} from './firmographics';
import {
  analyzePageGeo,
  verifyWebsiteReachable,
} from './verify';
import {
  buildDirectoryQueries,
  searchWebForCompanies,
} from './web-directory';

export type DiscoverCandidate = {
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  industry?: string;
  employeeCount?: number;
  companySize?: string;
  openJobsPosted?: number;
  contactName?: string;
  contactTitle?: string;
  source: 'grok' | 'grok-browse' | 'seed' | 'web-search';
  employees?: number | string;
  siteVerified?: boolean;
  geoVerified?: boolean;
  pageTextSnippet?: string;
};

/** Diagnostics for empty batches (surfaced in lastMessage). */
export type DiscoveryDiagnostics = {
  webSearchCount: number;
  completionCount: number;
  browseCount: number;
  afterHydrate: number;
  notes: string[];
};

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

function dedupeCandidates(
  list: DiscoverCandidate[],
  excludeNames: string[]
): DiscoverCandidate[] {
  const seen = new Set(excludeNames.map(normName).filter(Boolean));
  const domains = new Set<string>();
  const out: DiscoverCandidate[] = [];
  for (const c of list) {
    const n = normName(c.companyName);
    if (!n || seen.has(n)) continue;
    const d = domainOf(c.website);
    if (d && domains.has(d)) continue;
    seen.add(n);
    if (d) domains.add(d);
    out.push(c);
  }
  return out;
}

function mapGrokRows(
  rows: any[],
  targetGeo: string,
  source: DiscoverCandidate['source'] = 'grok'
): DiscoverCandidate[] {
  const out: DiscoverCandidate[] = [];
  for (const x of rows) {
    if (!x || typeof x !== 'object') continue;
    const companyName = String(
      x.companyName || x.name || x.company || ''
    ).trim();
    if (!companyName) continue;
    const website = x.website || x.url || x.domain || x.site;
    const city = x.city || x.location || x.town;
    const sizeRaw =
      x.employeeCount ?? x.employees ?? x.companySize ?? x.size ?? x.headcount;
    const size = parseEmployeeCount(sizeRaw);
    const openJobs = parseOpenJobsPosted(
      x.openJobsPosted ?? x.open_jobs_posted ?? x.openJobs ?? x.num_jobs ?? x.jobs
    );
    const cand: DiscoverCandidate = {
      companyName,
      website: website ? String(website).trim() : undefined,
      city: city ? String(city).trim() : undefined,
      state: x.state ? String(x.state).trim() : undefined,
      phone: x.phone ? String(x.phone).trim() : undefined,
      email: x.email ? String(x.email).trim() : undefined,
      industry: normalizeIndustry(x.industry || x.sector || x.vertical),
      employeeCount: size.employeeCount,
      companySize: size.companySize,
      openJobsPosted: openJobs,
      contactName: (() => {
        const v = x.contactName || x.contact_name || x.owner;
        return v ? String(v).trim() : undefined;
      })(),
      contactTitle: (() => {
        const v = x.contactTitle || x.title;
        return v ? String(v).trim() : undefined;
      })(),
      employees: sizeRaw,
      source,
    };
    if (cand.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cand.email)) {
      delete cand.email;
    }
    if (cand.phone) {
      const digits = (cand.phone.match(/\d/g) || []).length;
      if (digits < 7) delete cand.phone;
    }
    if (
      !looksInTargetArea(cand.city || cand.state, cand.companyName, targetGeo, {
        allowUnknown: true,
      })
    ) {
      continue;
    }
    out.push(cand);
  }
  return out;
}

/**
 * Live-site check + optional contact crawl. Keeps reachable sites even when
 * contact pages fail (runner will research them → researched count moves).
 */
async function hydrateContactsFromSites(
  candidates: DiscoverCandidate[],
  budgetMs: number,
  targetGeo: string
): Promise<DiscoverCandidate[]> {
  const started = Date.now();
  const out: DiscoverCandidate[] = [];

  for (const c of candidates) {
    if (Date.now() - started > budgetMs) {
      // Time up: keep remaining that already look solid
      if (c.siteVerified && c.website) out.push(c);
      else if (c.website && c.website.includes('.')) {
        // Soft-include so runner can still attempt (counts as researched)
        out.push({ ...c, siteVerified: false });
      }
      continue;
    }

    let website = c.website;
    if (!website || !website.includes('.')) continue;
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;

    const reach = await verifyWebsiteReachable(website);
    if (!reach.ok) continue;
    website = reach.finalUrl || website;

    const page = await fetchCompanyContactPages(website);
    if ('error' in page) {
      out.push({
        ...c,
        website,
        siteVerified: true,
        source: c.source === 'seed' ? 'seed' : c.source,
      });
      continue;
    }
    const sig = extractContactSignals(page.text);
    const pageGeo = analyzePageGeo(page.text, targetGeo);
    if (pageGeo.offTarget) continue;

    out.push({
      ...c,
      website: page.url || website,
      email: c.email || sig.emails[0],
      phone: c.phone || sig.phones[0],
      siteVerified: true,
      geoVerified: pageGeo.inTarget || undefined,
      pageTextSnippet: page.text.slice(0, 2000),
      source: c.source === 'seed' ? 'seed' : c.source,
    });
  }

  return out;
}

export type DiscoveryStrategyPhase = 0 | 1 | 2;

export function discoveryStrategyPhase(job: ListBuilderJob): DiscoveryStrategyPhase {
  const empty = job.progress?.emptyBatchStreak || 0;
  const batch = job.discoveryBatch || 0;
  if (empty >= 6 || (empty >= 4 && batch >= 8)) return 2;
  if (empty >= 3 || batch >= 5) return 1;
  return 0;
}

function buildCompletionPrompts(opts: {
  job: ListBuilderJob;
  targetGeo: string;
  keywords: string[];
  anchors: string[];
  excludeList: string;
  need: number;
  batch: number;
  already: number;
  target: number;
  focusCity: string;
  focusKw: string;
  phase: DiscoveryStrategyPhase;
  employeeCap?: number;
}): { system: string; user: string } {
  const {
    job,
    targetGeo,
    keywords,
    anchors,
    excludeList,
    need,
    batch,
    already,
    target,
    focusCity,
    focusKw,
    phase,
    employeeCap,
  } = opts;

  const honorCap = phase === 0 && !!employeeCap;

  const system = `You are a B2B research assistant for a recruiting agency (list builder).
Return ONLY a JSON array of real companies with a presence in ${targetGeo}.
Each object keys: companyName, website (official domain you are confident is real), city, state,
phone (optional — only if widely published), email (optional — only if widely published),
contactName, contactTitle, industry, employeeCount, companySize, openJobsPosted

CRITICAL:
- website MUST be a real official company domain (example.com form). Prefer .com that matches the firm.
- NEVER invent phone/email — omit if unsure.
- Prefer local ${targetGeo} offices over national HQ elsewhere.
- Max ${need} companies. Avoid: ${excludeList}
- ${honorCap ? `Prefer under ~${employeeCap} employees when known.` : 'Do not filter by employee count.'}
- Focus: ${focusKw} near ${focusCity}. Cities: ${anchors.slice(0, 8).join(', ')}
- Industry: ${keywords.slice(0, 4).join(', ') || 'construction'}
- Strategy phase ${phase}.`;

  const user = `User brief: ${job.brief}
Location REQUIRED: ${targetGeo}
Progress: ${already}/${target} usable leads kept. Batch #${batch}.
Return ${need} NEW companies as JSON array only.`;

  return { system, user };
}

/**
 * Primary discovery — web search + Grok knowledge, hydrate live sites.
 */
export async function discoverCompanyCandidates(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<DiscoverCandidate[]> {
  const { candidates } = await discoverCompanyCandidatesWithDiagnostics(
    job,
    excludeNames
  );
  return candidates;
}

export async function discoverCompanyCandidatesWithDiagnostics(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<{ candidates: DiscoverCandidate[]; diagnostics: DiscoveryDiagnostics }> {
  const diagnostics: DiscoveryDiagnostics = {
    webSearchCount: 0,
    completionCount: 0,
    browseCount: 0,
    afterHydrate: 0,
    notes: [],
  };

  const keyRes = await resolveGrokApiKey(job.userId);
  if ('error' in keyRes) {
    diagnostics.notes.push(keyRes.error);
    throw new Error(keyRes.error);
  }

  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const keywords = inferIndustryKeywords(job.brief, job.industry);
  const anchors = searchAnchorCities(targetGeo).slice(0, 8);
  const employeeCap = parseEmployeeCap(job.brief);
  const need = LIST_BUILDER_DEFAULTS.batchSize;
  const batch = (job.discoveryBatch || 0) + 1;
  const already = job.results.length;
  const target = job.targetSize;
  const excludeList = excludeNames.slice(0, 60).join(', ') || '(none yet)';
  const focusCity =
    anchors[(batch - 1) % Math.max(anchors.length, 1)] || targetGeo;
  const focusKw =
    keywords[(batch - 1) % Math.max(keywords.length, 1)] || 'construction';
  const phase = discoveryStrategyPhase(job);

  const batchStarted = Date.now();
  // Leave headroom under Vercel 60s + runner overhead
  const hardDeadline = batchStarted + 42_000;

  let pool: DiscoverCandidate[] = [];

  // --- 1) DuckDuckGo HTML search (real links, no API key) ---
  try {
    const queries = buildDirectoryQueries({
      brief: job.brief,
      targetGeo,
      industry: job.industry,
      keywords,
      batch,
    });
    // 1–2 queries per batch to save time
    for (const q of queries.slice(0, phase >= 1 ? 2 : 1)) {
      if (Date.now() > hardDeadline - 25_000) break;
      const found = await searchWebForCompanies({
        query: q,
        targetGeo,
        need: need + 2,
      });
      for (const f of found) {
        f.source = 'web-search';
        pool.push(f);
      }
    }
    diagnostics.webSearchCount = pool.length;
    if (pool.length === 0) {
      diagnostics.notes.push('web-search returned 0 links');
    }
  } catch (err: any) {
    diagnostics.notes.push(`web-search: ${err?.message || err}`);
  }

  // --- 2) Grok completion (knowledge → JSON companies) — fast, no tools ---
  if (Date.now() < hardDeadline - 18_000) {
    const prompts = buildCompletionPrompts({
      job,
      targetGeo,
      keywords,
      anchors,
      excludeList,
      need: need + 2,
      batch,
      already,
      target,
      focusCity,
      focusKw,
      phase,
      employeeCap,
    });
    const { text, error } = await grokWebResearch({
      system: prompts.system,
      user: prompts.user,
      timeoutMs: 22_000,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: phase >= 1 ? 'discover-complete-relaxed' : 'discover-complete',
        queryPreview: `p${phase} ${targetGeo}: ${job.brief}`.slice(0, 180),
      },
    });
    if (error && !text) {
      diagnostics.notes.push(`completion: ${error}`);
    } else if (text) {
      const parsed = parseJsonFromText<any[]>(text);
      if (Array.isArray(parsed.data)) {
        const mapped = mapGrokRows(parsed.data, targetGeo, 'grok');
        diagnostics.completionCount = mapped.length;
        pool.push(...mapped);
      } else {
        diagnostics.notes.push(`completion JSON: ${parsed.error || 'invalid'}`);
      }
    }
  }

  // --- 3) Short browse only if still thin (optional, budget-capped) ---
  if (
    pool.length < need &&
    Date.now() < hardDeadline - 20_000 &&
    phase >= 1
  ) {
    const browsed = await grokBrowseResearch({
      system: `You research local companies. You have fetch_website only.
Return a JSON array of companies in ${targetGeo} with companyName, website, city, state, phone, email.
NEVER invent phone/email. Prefer real domains. Max ${need}. Avoid: ${excludeList}`,
      user: `Brief: ${job.brief}\nFind ${need} ${focusKw} companies near ${focusCity}, ${targetGeo}. JSON array only.`,
      maxIterations: 3,
      timeoutMs: 18_000,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: 'discover-browse-short',
        queryPreview: targetGeo,
      },
    });
    if (browsed.text && !browsed.error) {
      const parsed = parseJsonFromText<any[]>(browsed.text);
      if (Array.isArray(parsed.data)) {
        const mapped = mapGrokRows(parsed.data, targetGeo, 'grok-browse');
        diagnostics.browseCount = mapped.length;
        pool.push(...mapped);
      }
    } else if (browsed.error) {
      diagnostics.notes.push(`browse: ${browsed.error}`);
    }
  }

  let list = dedupeCandidates(pool, excludeNames).slice(0, need * 3);

  if (list.length === 0) {
    diagnostics.notes.push('no candidates before hydrate');
    return { candidates: [], diagnostics };
  }

  // --- 4) Hydrate live sites ---
  const hydrateBudget = Math.max(
    8_000,
    Math.min(22_000, hardDeadline - Date.now() - 2_000)
  );
  list = await hydrateContactsFromSites(list, hydrateBudget, targetGeo);
  diagnostics.afterHydrate = list.length;

  // Prefer site-verified; if none verified, still return reachable-ish rows for runner
  const verified = list.filter((c) => c.siteVerified);
  const finalList = (verified.length > 0 ? verified : list).slice(0, need);

  if (finalList.length === 0) {
    diagnostics.notes.push(
      `hydrate dropped all (${pool.length} raw → 0 live sites)`
    );
  }

  return { candidates: finalList, diagnostics };
}

/**
 * Contact gap-fill: site crawl first, then short Grok browse.
 */
export async function enrichContactFromWeb(
  companyName: string,
  city?: string,
  website?: string,
  opts?: { userId?: string; tenantId?: string; jobId?: string }
): Promise<{
  email?: string;
  phone?: string;
  contactName?: string;
  notes?: string;
}> {
  const keyRes = await resolveGrokApiKey(opts?.userId);
  if ('error' in keyRes) return {};

  const place = city || '';
  const site = website || '';

  if (site && site.includes('.')) {
    let url = site;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const page = await fetchCompanyContactPages(url);
    if (!('error' in page)) {
      const sig = extractContactSignals(page.text);
      if (sig.emails[0] || sig.phones[0]) {
        return {
          email: sig.emails[0],
          phone: sig.phones[0],
          notes: 'Contact from site crawl',
        };
      }
    }
  }

  const system = `You find public contact info for BD outreach.
You ONLY have fetch_website. Open the company site, /contact, /about, /locations.
Return ONLY JSON: { "email"?: string, "phone"?: string, "contactName"?: string }
NEVER invent. Only values from tool results. Empty {} if none.`;

  const user = `Company: ${companyName}
City: ${place || 'unknown'}
Website: ${site || 'unknown'}

fetch_website the homepage and contact page, then JSON only.`;

  const browsed = await grokBrowseResearch({
    system,
    user,
    maxIterations: 3,
    timeoutMs: 22_000,
    usageCtx: {
      tenantId: opts?.tenantId,
      userId: opts?.userId,
      jobId: opts?.jobId,
      purpose: 'enrich-browse',
      queryPreview: companyName,
    },
  });

  if (!browsed.text) return {};

  const parsed = parseJsonFromText<Record<string, string>>(browsed.text);
  const data =
    parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const signals = extractContactSignals(browsed.text);

  const out: {
    email?: string;
    phone?: string;
    contactName?: string;
    notes?: string;
  } = {};
  const email = (data.email || signals.emails[0] || '').trim();
  const phone = (data.phone || signals.phones[0] || '').trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email;
  if (phone && (phone.match(/\d/g) || []).length >= 7) out.phone = phone;
  if (data.contactName?.trim()) out.contactName = data.contactName.trim();
  if (out.email || out.phone) {
    out.notes = 'Contact from Grok fetch_website browse';
  }
  return out;
}
