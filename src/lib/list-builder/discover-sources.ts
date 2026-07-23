/**
 * Company discovery for list-builder.
 *
 * Failure modes we hit in prod:
 * - DuckDuckGo HTML returns bot-challenge (HTTP 202, 0 links)
 * - Grok-only + fetch_website cannot *search* and often times out under 60s
 * - Hydrate drop-all left researched=0 forever
 *
 * Reliable path now:
 * 1. Curated FL construction seed catalog (rotated by batch) — always available
 * 2. Grok completion for additional names + domain guessing
 * 3. Optional DDG (best-effort; often blocked)
 * 4. Light site verify + contact scrape (budget-capped)
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
import {
  getSeedFirmsForMarket,
  guessDomainsFromName,
} from './seed-catalog';

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
  source: 'grok' | 'grok-browse' | 'seed' | 'web-search' | 'catalog';
  employees?: number | string;
  siteVerified?: boolean;
  geoVerified?: boolean;
  pageTextSnippet?: string;
};

export type DiscoveryDiagnostics = {
  webSearchCount: number;
  completionCount: number;
  browseCount: number;
  catalogCount: number;
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
    // Soft geo — allow unknown so knowledge firms with wrong city still get verified
    if (
      cand.city &&
      !looksInTargetArea(cand.city || cand.state, cand.companyName, targetGeo, {
        allowUnknown: true,
      })
    ) {
      // keep anyway — page geo gate later
    }
    out.push(cand);
  }
  return out;
}

/** Resolve a working website for a candidate (given or guessed). */
async function resolveWebsite(
  c: DiscoverCandidate,
  deadline: number
): Promise<DiscoverCandidate | null> {
  const tryUrls: string[] = [];
  if (c.website) {
    let w = c.website.trim();
    if (!/^https?:\/\//i.test(w) && w.includes('.')) w = `https://${w}`;
    tryUrls.push(w);
  }
  for (const g of guessDomainsFromName(c.companyName)) {
    if (!tryUrls.includes(g)) tryUrls.push(g);
  }

  for (const url of tryUrls.slice(0, 4)) {
    if (Date.now() > deadline) break;
    const reach = await verifyWebsiteReachable(url);
    if (reach.ok) {
      return {
        ...c,
        website: reach.finalUrl || url,
        siteVerified: true,
      };
    }
  }
  return null;
}

/**
 * Light hydrate: resolve site, optional contact crawl. Never drops resolved sites.
 */
async function hydrateContactsFromSites(
  candidates: DiscoverCandidate[],
  budgetMs: number,
  targetGeo: string
): Promise<DiscoverCandidate[]> {
  const started = Date.now();
  const deadline = started + budgetMs;
  const out: DiscoverCandidate[] = [];

  for (const c of candidates) {
    if (Date.now() > deadline) {
      // Keep already-verified; skip rest
      if (c.siteVerified && c.website) out.push(c);
      continue;
    }

    const resolved =
      c.siteVerified && c.website
        ? c
        : await resolveWebsite(c, deadline);
    if (!resolved?.website) continue;

    // Contact crawl when time remains
    if (Date.now() < deadline - 3_000) {
      const page = await fetchCompanyContactPages(resolved.website);
      if (!('error' in page)) {
        const sig = extractContactSignals(page.text);
        const pageGeo = analyzePageGeo(page.text, targetGeo);
        // Drop multi-state / out-of-Florida office footprints early
        if (pageGeo.hasOfficesOutsideFlorida) {
          continue;
        }
        out.push({
          ...resolved,
          website: page.url || resolved.website,
          email: c.email || sig.emails[0],
          phone: c.phone || sig.phones[0],
          siteVerified: true,
          geoVerified: pageGeo.inTarget || undefined,
          pageTextSnippet: page.text.slice(0, 2000),
        });
        continue;
      }
    }

    out.push({ ...resolved, siteVerified: true });
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

  const sizeRule = honorCap
    ? `Prefer under ~${employeeCap} employees when known.`
    : 'Prefer small-to-mid firms (roughly under 500 employees). Skip national GCs and multi-state chains.';

  const system = `You list real construction / contracting companies that operate in ${targetGeo}, Florida.
Return ONLY a JSON array (no markdown). Each object:
{"companyName":"...","website":"https://...","city":"...","state":"FL"}

Rules:
- Florida-local / regional only — NO firms with offices outside Florida (even if HQ is in Florida)
- Prefer small-to-medium specialty contractors, regional GCs, and builders — not national giants
- website: official domain if known; omit if unsure (do not invent random domains)
- NEVER invent phone or email
- Max ${need} companies. Do not include: ${excludeList}
- ${sizeRule}
- Focus industry: ${keywords.slice(0, 4).join(', ') || 'construction'} near ${focusCity}
- Cities: ${anchors.slice(0, 8).join(', ')}`;

  const user = `Brief: ${job.brief}
Location: ${targetGeo} (Florida-local SMB only — no multi-state footprints).
Batch ${batch}. Need ${need} NEW companies (${already}/${target} already kept).
JSON array only.`;

  return { system, user };
}

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
    catalogCount: 0,
    afterHydrate: 0,
    notes: [],
  };

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
  // Fit under Vercel 60s with room for runner contact work
  const hardDeadline = batchStarted + 38_000;

  let pool: DiscoverCandidate[] = [];

  // --- 1) ALWAYS seed from curated catalog (works when DDG/Grok fail) ---
  const seeds = getSeedFirmsForMarket(
    targetGeo,
    job.brief,
    batch,
    need,
    excludeNames
  );
  for (const s of seeds) {
    pool.push({
      companyName: s.companyName,
      website: s.website,
      city: s.city,
      state: s.state,
      industry: s.industry,
      source: 'catalog',
    });
  }
  diagnostics.catalogCount = seeds.length;
  if (!seeds.length) {
    diagnostics.notes.push('catalog empty for market');
  }

  // --- 2) Grok completion (extra names) — best-effort, short timeout ---
  const keyRes = await resolveGrokApiKey(job.userId);
  if ('error' in keyRes) {
    diagnostics.notes.push(keyRes.error);
  } else if (Date.now() < hardDeadline - 15_000) {
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
      timeoutMs: 18_000,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: 'discover-complete',
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

  // --- 3) DDG best-effort (often bot-blocked on serverless) ---
  if (Date.now() < hardDeadline - 20_000) {
    try {
      const queries = buildDirectoryQueries({
        brief: job.brief,
        targetGeo,
        industry: job.industry,
        keywords,
        batch,
      });
      const found = await searchWebForCompanies({
        query: queries[0],
        targetGeo,
        need: need + 2,
      });
      diagnostics.webSearchCount = found.length;
      if (found.length === 0) {
        diagnostics.notes.push('web-search blocked/empty');
      }
      for (const f of found) {
        f.source = 'web-search';
        pool.push(f);
      }
    } catch (err: any) {
      diagnostics.notes.push(`web-search: ${err?.message || err}`);
    }
  }

  let list = dedupeCandidates(pool, excludeNames).slice(0, need * 3);

  if (list.length === 0) {
    diagnostics.notes.push('no candidates before hydrate');
    return { candidates: [], diagnostics };
  }

  // --- 4) Resolve live sites + light contact scrape ---
  const hydrateBudget = Math.max(
    10_000,
    Math.min(24_000, hardDeadline - Date.now() - 1_000)
  );
  list = await hydrateContactsFromSites(list, hydrateBudget, targetGeo);
  diagnostics.afterHydrate = list.length;

  // Prefer verified; never return empty if we still have unresolved catalog rows — try bare pass
  let finalList = list.filter((c) => c.siteVerified).slice(0, need);
  if (finalList.length === 0 && list.length > 0) {
    finalList = list.slice(0, need);
  }
  // Absolute last resort: return catalog seeds without hydrate so runner can research
  if (finalList.length === 0 && seeds.length > 0) {
    finalList = seeds.slice(0, need).map((s) => ({
      companyName: s.companyName,
      website: s.website,
      city: s.city,
      state: s.state,
      industry: s.industry,
      source: 'catalog' as const,
      siteVerified: false,
    }));
    diagnostics.notes.push('returned raw catalog without hydrate');
  }

  if (finalList.length === 0) {
    diagnostics.notes.push(
      `all sources failed (pool ${pool.length}, hydrate ${list.length})`
    );
  }

  return { candidates: finalList, diagnostics };
}

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

  // Domain-guess then crawl
  for (const guess of guessDomainsFromName(companyName).slice(0, 3)) {
    const reach = await verifyWebsiteReachable(guess);
    if (!reach.ok) continue;
    const page = await fetchCompanyContactPages(reach.finalUrl || guess);
    if ('error' in page) continue;
    const sig = extractContactSignals(page.text);
    if (sig.emails[0] || sig.phones[0]) {
      return {
        email: sig.emails[0],
        phone: sig.phones[0],
        notes: 'Contact from domain guess + crawl',
      };
    }
  }

  // Optional Grok — short
  const keyRes = await resolveGrokApiKey(opts?.userId);
  if ('error' in keyRes) return {};

  const { text } = await grokWebResearch({
    system: `Return ONLY JSON: {"email"?:string,"phone"?:string,"contactName"?:string}
Only public company contact info you are highly confident is real for ${companyName} in ${place || 'Florida'}. Prefer main switchboard. Empty {} if unsure. NEVER invent.`,
    user: `Company: ${companyName}\nWebsite: ${site || 'unknown'}\nCity: ${place}`,
    timeoutMs: 12_000,
    usageCtx: {
      tenantId: opts?.tenantId,
      userId: opts?.userId,
      jobId: opts?.jobId,
      purpose: 'enrich-complete',
      queryPreview: companyName,
    },
  });
  if (!text) return {};
  const parsed = parseJsonFromText<Record<string, string>>(text);
  const data =
    parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const out: {
    email?: string;
    phone?: string;
    contactName?: string;
    notes?: string;
  } = {};
  if (data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    out.email = data.email.trim();
  }
  if (data.phone && (data.phone.match(/\d/g) || []).length >= 7) {
    out.phone = data.phone.trim();
  }
  if (data.contactName?.trim()) out.contactName = data.contactName.trim();
  if (out.email || out.phone) out.notes = 'Contact from Grok knowledge (verify)';
  return out;
}
