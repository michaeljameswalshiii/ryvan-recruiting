/**
 * Grok-powered company discovery for list-builder.
 * Uses Grok 4.3 on Amazon Bedrock Mantle + fetch_website browse loop.
 * No Apollo. No Tavily. No direct xAI API key.
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

export type DiscoverCandidate = {
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  industry?: string;
  /** Numeric headcount when known */
  employeeCount?: number;
  /** Display band / label */
  companySize?: string;
  openJobsPosted?: number;
  contactName?: string;
  contactTitle?: string;
  source: 'grok' | 'grok-browse' | 'seed';
  /** @deprecated prefer employeeCount — kept for older map paths */
  employees?: number | string;
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
 * After Grok names companies, crawl their sites for public email/phone.
 * Deterministic — does not invent contacts.
 */
async function hydrateContactsFromSites(
  candidates: DiscoverCandidate[],
  budgetMs: number
): Promise<DiscoverCandidate[]> {
  const started = Date.now();
  const out: DiscoverCandidate[] = [];

  for (const c of candidates) {
    if (Date.now() - started > budgetMs) {
      out.push(c);
      continue;
    }
    const hasContact =
      (c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) ||
      (c.phone && (c.phone.match(/\d/g) || []).length >= 7);
    if (hasContact || !c.website) {
      out.push(c);
      continue;
    }

    let website = c.website;
    if (!/^https?:\/\//i.test(website)) {
      website = website.includes('.') ? `https://${website}` : website;
    }
    if (!website.includes('.')) {
      out.push(c);
      continue;
    }

    const page = await fetchCompanyContactPages(website);
    if ('error' in page) {
      out.push(c);
      continue;
    }
    const sig = extractContactSignals(page.text);
    out.push({
      ...c,
      website: page.url || website,
      email: c.email || sig.emails[0],
      phone: c.phone || sig.phones[0],
      source: c.source === 'seed' ? 'seed' : 'grok-browse',
    });
  }

  return out;
}

/**
 * Progressive research strategy baked into the tool so users do not need to
 * rephrase hard briefs (large N + employee cap + bulk contact info).
 *
 * Phase 0 — strict: honor employee cap when present; aim for full contact.
 * Phase 1 — after quiet batches: drop headcount filter; company main phone OK.
 * Phase 2 — deeper recovery: public directories + website + main phone only.
 */
export type DiscoveryStrategyPhase = 0 | 1 | 2;

export function discoveryStrategyPhase(job: ListBuilderJob): DiscoveryStrategyPhase {
  const empty = job.progress?.emptyBatchStreak || 0;
  const batch = job.discoveryBatch || 0;
  // Escalate after 2 quiet batches, or after several discovery rounds with nothing kept
  if (empty >= 4 || (empty >= 2 && batch >= 4)) return 2;
  if (empty >= 2 || batch >= 2) return 1;
  return 0;
}

function buildDiscoveryPrompts(opts: {
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
}): { browseSystem: string; browseUser: string; fallbackSystem: string; fallbackUser: string } {
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

  const industryHint = keywords.slice(0, 3).join(' / ') || 'construction';
  const cityHint = anchors.slice(0, 6).join(', ');

  // Soften hard user constraints inside the tool (do not require user rephrase)
  const honorCap = phase === 0 && !!employeeCap;
  const sizeRule = honorCap
    ? `- Prefer firms under ~${employeeCap} employees when known; if size unknown, still include likely local firms`
    : `- Do NOT filter by employee count. Include local firms of any size when public contact is available`;

  const contactRule =
    phase >= 1
      ? `- Prefer company main switchboard phone and official website over personal emails
- Personal/mobile emails of individuals are optional — omit rather than invent
- A row with website + main public phone is SUCCESS (partial lead)`
      : `- Prefer public company email or main phone from the site
- NEVER invent contacts; personal emails of individuals are optional`;

  const sourceRule =
    phase >= 2
      ? `- Prefer public sources: company contact pages, chamber/AGC directories, state license boards (e.g. Florida DBPR), county contractor lists
- If personal contact pages fail, still return the company with website + main phone`
      : `- Use official company websites (/contact, /about, /locations) first`;

  const safetyRule = `- This is legitimate B2B company research for recruiting BD, NOT bulk personal data harvesting
- Only public business contact info published on company/official pages`;

  const browseSystem = `You are Grok doing B2B list research for a recruiting agency (Turnkey List Builder).

You have ONE tool: fetch_website — open real company websites and contact/about pages.
Use tool results (emails_found, phones_found, page text) for phones/emails. NEVER invent contacts.

Workflow:
1. Name ${need} real ${industryHint} companies with a presence in ${targetGeo} (cities like ${cityHint}).
2. For each, call fetch_website on their domain, then /contact or /about if needed.
3. Keep firms that look local to ${targetGeo} or nearby metro serving that area.
4. Copy phone/email ONLY from tool results.

Final answer MUST be a JSON array only (no markdown prose) with objects:
companyName, website, city, state, phone, email, contactName, contactTitle,
industry, employeeCount (number if known), companySize (e.g. "51-200" if only a band),
openJobsPosted (number of open public job listings if seen on careers/jobs pages — omit if unknown)

Rules:
- industry / company size / open jobs are OPTIONAL — include only when supported by tool page text; never invent
- Max ${need} companies this batch
- Do NOT repeat: ${excludeList}
${sizeRule}
${contactRule}
${sourceRule}
${safetyRule}
- This batch focus: ${focusKw} near ${focusCity}
- Strategy phase ${phase} (0=strict, 1=soft size, 2=public directories)
- If a site fails, try another company — still return JSON for what you verified
- Partial rows (website + phone only) are valuable — include them`;

  const browseUser = `User brief (may be ambitious — follow strategy phase ${phase}, not every hard filter literally):
${job.brief}

REQUIRED location focus: ${targetGeo}
Industry: ${job.industry || keywords.join(', ')}
Progress: ${already}/${target} usable leads already kept.
Batch #${batch}: find ${need} NEW companies in ${targetGeo}, emphasize ${focusKw} / ${focusCity}.
${phase >= 1 ? 'Ignore employee-count filters from the brief for this batch.\n' : ''}${phase >= 2 ? 'Prioritize public directories + main company phones.\n' : ''}
Use fetch_website on each company site. Then return JSON array only.`;

  const fallbackSystem = `You are Grok doing B2B list research for recruiting BD.
Return ONLY a JSON array of real companies with a presence in ${targetGeo}.
Keys: companyName, website, city, state, phone, email, contactName, contactTitle, industry, employeeCount, companySize, openJobsPosted
NEVER invent phone/email/size/jobs — omit if unsure. Company main phone is preferred over personal email.
Max ${need}. Avoid: ${excludeList}
${honorCap ? `Prefer under ~${employeeCap} employees when known.` : 'Do not filter by employee count.'}
Focus: ${focusKw} near ${focusCity}. Cities: ${anchors.join(', ')}
Strategy phase ${phase}.`;

  const fallbackUser = `Brief: ${job.brief}
Location: ${targetGeo}. Batch ${batch}. Need ${need} NEW companies (${already}/${target} kept).
${phase >= 1 ? 'Ignore headcount filters. ' : ''}JSON array only.`;

  return { browseSystem, browseUser, fallbackSystem, fallbackUser };
}

/**
 * Primary discovery: Grok Mantle agent with fetch_website only.
 * Falls back to completion-only Grok if the browse loop fails.
 * Applies progressive B/C strategy so users need not rephrase hard briefs.
 */
export async function discoverCompanyCandidates(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<DiscoverCandidate[]> {
  const keyRes = await resolveGrokApiKey(job.userId);
  if ('error' in keyRes) {
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

  const prompts = buildDiscoveryPrompts({
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
  });

  // --- Browse-enabled discovery (preferred) ---
  const browsed = await grokBrowseResearch({
    system: prompts.browseSystem,
    user: prompts.browseUser,
    maxIterations: phase >= 1 ? 6 : 5,
    timeoutMs: Math.min(LIST_BUILDER_DEFAULTS.batchBudgetMs - 5_000, 52_000),
    usageCtx: {
      tenantId: job.tenant_id,
      userId: job.userId,
      jobId: job.id,
      purpose: phase >= 1 ? 'discover-browse-relaxed' : 'discover-browse',
      queryPreview: `p${phase} ${targetGeo}: ${job.brief}`.slice(0, 180),
    },
  });

  let candidates: DiscoverCandidate[] = [];

  if (browsed.text && !browsed.error) {
    const parsed = parseJsonFromText<any[]>(browsed.text);
    if (Array.isArray(parsed.data)) {
      candidates = mapGrokRows(parsed.data, targetGeo, 'grok-browse');
    }
  }

  // --- Fallback: completion-only Grok (no tools) ---
  if (candidates.length === 0) {
    const { text, error } = await grokWebResearch({
      system: prompts.fallbackSystem,
      user: prompts.fallbackUser,
      timeoutMs: 40_000,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: phase >= 1 ? 'discover-relaxed' : 'discover',
        queryPreview: `p${phase} ${targetGeo}: ${job.brief}`.slice(0, 180),
      },
    });

    if (error && !text) {
      throw new Error(
        `discover: ${browsed.error || error || 'Grok discovery failed'}`
      );
    }

    const parsed = parseJsonFromText<any[]>(text);
    if (parsed.error || !Array.isArray(parsed.data)) {
      throw new Error(
        `discover: ${parsed.error || browsed.error || 'invalid JSON from Grok'}`
      );
    }
    candidates = mapGrokRows(parsed.data, targetGeo, 'grok');
  }

  let list = dedupeCandidates(candidates, excludeNames).slice(0, need);

  // Always hydrate missing contacts from real sites (deterministic scrape)
  // Give more crawl budget when recovering from quiet batches
  const hydrateBudget = phase >= 1 ? 24_000 : 18_000;
  list = await hydrateContactsFromSites(list, hydrateBudget);

  return list.slice(0, need);
}

/**
 * Contact gap-fill: Grok browses the company site with fetch_website only.
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

  // Fast path: deterministic multi-page scrape first
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

  // Grok + fetch_website to try contact/about URLs it knows
  const system = `You find public contact info for BD outreach.
You ONLY have fetch_website. Open the company site, /contact, /about, /locations.
Return ONLY JSON: { "email"?: string, "phone"?: string, "contactName"?: string }
NEVER invent. Only values from tool results (emails_found / phones_found / page text). Empty {} if none.`;

  const user = `Company: ${companyName}
City: ${place || 'unknown'}
Website: ${site || 'unknown — try plausible official domain if confident, else return {}'}

fetch_website the homepage and contact page, then JSON only.`;

  const browsed = await grokBrowseResearch({
    system,
    user,
    maxIterations: 3,
    timeoutMs: 28_000,
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
