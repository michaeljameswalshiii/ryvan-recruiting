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

export type DiscoverCandidate = {
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  industry?: string;
  contactName?: string;
  contactTitle?: string;
  source: 'grok' | 'grok-browse' | 'seed';
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
    const cand: DiscoverCandidate = {
      companyName,
      website: website ? String(website).trim() : undefined,
      city: city ? String(city).trim() : undefined,
      state: x.state ? String(x.state).trim() : undefined,
      phone: x.phone ? String(x.phone).trim() : undefined,
      email: x.email ? String(x.email).trim() : undefined,
      industry: x.industry ? String(x.industry).trim() : undefined,
      contactName: (() => {
        const v = x.contactName || x.contact_name || x.owner;
        return v ? String(v).trim() : undefined;
      })(),
      contactTitle: (() => {
        const v = x.contactTitle || x.title;
        return v ? String(v).trim() : undefined;
      })(),
      employees: x.employees || x.employeeCount || x.size,
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
 * Primary discovery: Grok Mantle agent with fetch_website only.
 * Falls back to completion-only Grok if the browse loop fails.
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
  const cap = parseEmployeeCap(job.brief);
  const need = LIST_BUILDER_DEFAULTS.batchSize;
  const batch = (job.discoveryBatch || 0) + 1;
  const already = job.results.length;
  const target = job.targetSize;
  const excludeList = excludeNames.slice(0, 60).join(', ') || '(none yet)';
  const focusCity =
    anchors[(batch - 1) % Math.max(anchors.length, 1)] || targetGeo;
  const focusKw =
    keywords[(batch - 1) % Math.max(keywords.length, 1)] || 'construction';

  const browseSystem = `You are Grok 4.3 on Amazon Bedrock Mantle doing B2B list research for a recruiting agency.

You have ONE tool: fetch_website — use it to open real company websites and contact/about pages.
This is how you verify firms and get public phone/email (from page text / emails_found / phones_found).

Workflow:
1. Name ${need} real ${keywords.slice(0, 2).join('/')} companies in ${targetGeo} (cities like ${anchors.slice(0, 5).join(', ')}).
2. For each, call fetch_website on their domain, then /contact or /about if needed.
3. Only keep companies whose site loads and look local to ${targetGeo}.
4. Copy phone/email ONLY from tool results (emails_found, phones_found, or visible page text). NEVER invent contacts.

Final answer MUST be a JSON array only (no markdown prose) with objects:
companyName, website, city, state, phone, email, contactName, contactTitle, industry

Rules:
- Max ${need} companies
- Do NOT repeat: ${excludeList}
- Prefer firms${cap ? ` under ~${cap} employees` : ' that are local SMBs'}
- This batch focus: ${focusKw} near ${focusCity}
- If a site fails, try another company — still return JSON for what you verified`;

  const browseUser = `Brief: ${job.brief}

REQUIRED location: ${targetGeo}
Industry: ${job.industry || keywords.join(', ')}
Progress: ${already}/${target} usable leads already kept.
Batch #${batch}: find ${need} NEW companies in ${targetGeo}, emphasize ${focusKw} / ${focusCity}.

Use fetch_website on each company site. Then return JSON array only.`;

  // --- Browse-enabled discovery (preferred) ---
  const browsed = await grokBrowseResearch({
    system: browseSystem,
    user: browseUser,
    maxIterations: 5,
    timeoutMs: Math.min(LIST_BUILDER_DEFAULTS.batchBudgetMs - 5_000, 52_000),
    usageCtx: {
      tenantId: job.tenant_id,
      userId: job.userId,
      jobId: job.id,
      purpose: 'discover-browse',
      queryPreview: `${targetGeo}: ${job.brief}`.slice(0, 180),
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
    const system = `You are Grok 4.3 on Amazon Bedrock Mantle doing B2B list research.
Return ONLY a JSON array of real companies in ${targetGeo}.
Keys: companyName, website, city, state, phone, email, contactName, contactTitle, industry
NEVER invent phone/email — omit if unsure. Max ${need}. Avoid: ${excludeList}
Focus: ${focusKw} near ${focusCity}. Cities: ${anchors.join(', ')}`;

    const user = `Brief: ${job.brief}
Location: ${targetGeo}. Batch ${batch}. Need ${need} NEW companies (${already}/${target} kept).
JSON array only.`;

    const { text, error } = await grokWebResearch({
      system,
      user,
      timeoutMs: 40_000,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: 'discover',
        queryPreview: `${targetGeo}: ${job.brief}`.slice(0, 180),
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
  list = await hydrateContactsFromSites(list, 18_000);

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
