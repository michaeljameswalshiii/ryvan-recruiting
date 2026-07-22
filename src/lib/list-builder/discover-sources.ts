/**
 * Grok-powered company discovery for list-builder.
 * Uses xAI web_search (same capability as manual Grok research).
 * No Apollo. No Tavily.
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
import { extractContactSignals } from './fetch-page';
import {
  grokWebResearch,
  parseJsonFromText,
  resolveGrokApiKey,
} from './grok-search';

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
  source: 'grok' | 'seed';
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

const EXCLUDED_SEARCH_DOMAINS = [
  'indeed.com',
  'linkedin.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'facebook.com',
];

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
  targetGeo: string
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
      source: 'grok',
    };
    // Soft sanity on invented contacts from page text only (regex)
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
 * Discover companies with Grok + live web_search (batch-aware, no Apollo/Tavily).
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
  // Rotate focus so batches don't all return the same SERP
  const focusCity = anchors[(batch - 1) % Math.max(anchors.length, 1)] || targetGeo;
  const focusKw = keywords[(batch - 1) % Math.max(keywords.length, 1)] || 'construction';

  const system = `You are Grok doing B2B list research for a recruiting agency (same quality as when a human asks you in chat).
You have live web_search. USE IT to find real companies — do not invent firms.

Return ONLY a JSON array (no markdown prose outside JSON) of objects with keys:
companyName, website, city, state, phone, email, contactName, contactTitle, industry, employees

Rules:
- Every company must be physically in or primarily serving: ${targetGeo}
- Valid local cities include: ${anchors.join(', ') || targetGeo}
- Prefer ${keywords.slice(0, 4).join(', ') || 'local'} firms${cap ? ` with under ~${cap} employees` : ' (SMB preferred)'}
- Include public phone and/or email when you find them on the open web (company site, directories, BBB). NEVER invent contact info.
- Prefer company websites over job boards or social profiles
- Max ${need} companies
- Do NOT repeat: ${excludeList}
- Diversify this batch around: ${focusKw} near ${focusCity}`;

  const user = `Research request (batch ${batch}):
${job.brief}

REQUIRED location: ${targetGeo}
Industry focus: ${job.industry || keywords.join(', ')}
We already have ${already}/${target} usable leads. Find ${need} NEW companies in ${targetGeo} only.
Search the web for real local businesses (directories, company sites, chamber lists, "best of", contractor associations).
For this batch emphasize: ${focusKw} companies in/near ${focusCity}.

Return JSON array only.`;

  const { text, error } = await grokWebResearch({
    apiKey: keyRes.apiKey,
    system,
    user,
    timeoutMs: Math.max(LIST_BUILDER_DEFAULTS.llmTimeoutMs, 50_000),
    excludedDomains: EXCLUDED_SEARCH_DOMAINS,
    usageCtx: {
      tenantId: job.tenant_id,
      userId: job.userId,
      jobId: job.id,
      purpose: 'discover',
      queryPreview: `${targetGeo}: ${job.brief}`.slice(0, 180),
    },
  });

  if (error && !text) {
    throw new Error(`discover: ${error}`);
  }

  const parsed = parseJsonFromText<any[]>(text);
  if (parsed.error || !Array.isArray(parsed.data)) {
    // Retry once with a stricter "JSON only" nudge if Grok returned prose
    const retry = await grokWebResearch({
      apiKey: keyRes.apiKey,
      system:
        system +
        '\nCRITICAL: Your entire reply must be a single JSON array. No intro, no bullets, no markdown.',
      user: `Same request. Location ${targetGeo}. Return ONLY JSON array of up to ${need} companies with companyName, website, city, phone, email.`,
      timeoutMs: 45_000,
      excludedDomains: EXCLUDED_SEARCH_DOMAINS,
      usageCtx: {
        tenantId: job.tenant_id,
        userId: job.userId,
        jobId: job.id,
        purpose: 'discover-retry',
        queryPreview: targetGeo,
      },
    });
    if (retry.error && !retry.text) throw new Error(`discover: ${retry.error}`);
    const parsed2 = parseJsonFromText<any[]>(retry.text);
    if (parsed2.error || !Array.isArray(parsed2.data)) {
      throw new Error(`discover: ${parsed2.error || 'invalid JSON from Grok'}`);
    }
    return dedupeCandidates(
      mapGrokRows(parsed2.data, targetGeo),
      excludeNames
    ).slice(0, need);
  }

  return dedupeCandidates(
    mapGrokRows(parsed.data, targetGeo),
    excludeNames
  ).slice(0, need);
}

/**
 * When site scrape finds no email/phone, ask Grok to web-search for public contacts.
 */
export async function enrichContactFromWeb(
  companyName: string,
  city?: string,
  website?: string,
  opts?: { userId?: string; tenantId?: string; jobId?: string }
): Promise<{ email?: string; phone?: string; contactName?: string; notes?: string }> {
  const keyRes = await resolveGrokApiKey(opts?.userId);
  if ('error' in keyRes) return {};

  const place = city || '';
  const system = `You find public contact info for BD outreach.
Use web_search. Return ONLY JSON object: { "email"?: string, "phone"?: string, "contactName"?: string }
Rules: NEVER invent. Only include values you can attribute to a public page. Prefer main office phone and general/info/sales email. Empty object if nothing public.`;

  const user = `Find public phone or email for:
Company: ${companyName}
City/area: ${place || 'unknown'}
Website: ${website || 'unknown'}

Search the company site, Google business listings, BBB, etc. JSON only.`;

  const { text, error } = await grokWebResearch({
    apiKey: keyRes.apiKey,
    system,
    user,
    timeoutMs: 28_000,
    usageCtx: {
      tenantId: opts?.tenantId,
      userId: opts?.userId,
      jobId: opts?.jobId,
      purpose: 'enrich-contact',
      queryPreview: companyName,
    },
  });

  if (error && !text) return {};

  const parsed = parseJsonFromText<Record<string, string>>(text);
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  // Also scrape any contact strings from raw text as backup
  const signals = extractContactSignals(text || '');

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
    out.notes = 'Contact found via Grok web search';
  }
  return out;
}
