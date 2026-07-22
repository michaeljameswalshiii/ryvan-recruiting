/**
 * Multi-source company discovery for list-builder.
 * Apollo (structured) + Tavily (web) + LLM (fallback/enrichment).
 * @serverOnly
 */

import {
  isApolloConfigured,
  searchCompanies,
  type ApolloCompany,
} from '@/lib/apollo/client';
import { completeJson } from './llm-json';
import {
  employeeRangesForCap,
  inferIndustryKeywords,
  knownLocalityNames,
  looksInTargetArea,
  parseEmployeeCap,
  resolveTargetGeography,
  searchAnchorCities,
} from './geo';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';
import type { ListBuilderJob } from '@/lib/schemas/list-builder';
import { extractContactSignals } from './fetch-page';

export type DiscoverCandidate = {
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  industry?: string;
  source: 'apollo' | 'tavily' | 'llm' | 'seed';
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

const DIRECTORY_HOSTS =
  /yelp\.|yellowpages\.|bbb\.org|facebook\.com|linkedin\.com|instagram\.com|twitter\.com|x\.com|mapquest\.|apple\.com\/maps|google\.[^/]+\/maps|angi\.com|homeadvisor\.|thumbtack\.|craigslist\.|wikipedia\.|indeed\.|glassdoor\.|zoominfo\.|dnb\.com|bloomberg\.|crunchbase\./i;

function isCompanySite(url?: string): boolean {
  if (!url) return false;
  try {
    const h = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return !DIRECTORY_HOSTS.test(h);
  } catch {
    return false;
  }
}

function companyFromTitle(title: string): string {
  return (title || '')
    .replace(/\s*[\|–—-]\s*.*$/, '')
    .replace(/\s*(Home|Official Site|Contact|About).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function tavilySearch(
  query: string,
  maxResults = 8
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn('[list-builder/tavily]', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      snippet: String(r.content || r.snippet || ''),
    }));
  } catch (err: any) {
    console.warn('[list-builder/tavily]', err?.message || err);
    return [];
  }
}

function apolloToCandidate(c: ApolloCompany): DiscoverCandidate | null {
  const name = (c.name || '').trim();
  if (!name || /^unknown/i.test(name)) return null;
  const website =
    c.website ||
    (c.domain
      ? c.domain.startsWith('http')
        ? c.domain
        : `https://${c.domain}`
      : undefined);
  const city =
    c.city ||
    (c.headquarters_location
      ? c.headquarters_location.split(',')[0]?.trim()
      : undefined);
  return {
    companyName: name,
    website,
    city,
    state: c.state,
    phone: c.phone,
    industry: c.industry,
    source: 'apollo',
    employees: c.employees_count || c.size,
  };
}

/**
 * Build rotating search queries so batches don't all hit the same SERP.
 */
export function buildDiscoveryQueries(
  job: ListBuilderJob,
  batchIndex: number
): string[] {
  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const keywords = inferIndustryKeywords(job.brief, job.industry);
  const anchors = searchAnchorCities(targetGeo);
  const primaryKw = keywords[0] || 'construction';
  const secondaryKw = keywords[(batchIndex + 1) % keywords.length] || primaryKw;
  const city = anchors[batchIndex % anchors.length] || targetGeo;
  const city2 = anchors[(batchIndex + 3) % anchors.length] || city;

  return [
    `${primaryKw} companies ${targetGeo}`,
    `${secondaryKw} contractor ${city} FL`,
    `best ${primaryKw} companies in ${city2}`,
    `"${primaryKw}" "${city}" (contact OR phone) -job -salary -indeed`,
    `${primaryKw} general contractor ${targetGeo} website`,
  ];
}

async function discoverFromApollo(
  job: ListBuilderJob,
  exclude: Set<string>
): Promise<DiscoverCandidate[]> {
  if (!isApolloConfigured()) return [];

  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const keywords = inferIndustryKeywords(job.brief, job.industry);
  const cap = parseEmployeeCap(job.brief);
  const ranges = employeeRangesForCap(cap || 300);
  const page = Math.max(1, (job.discoveryBatch || 0) + 1);
  // Rotate keyword focus per batch
  const kwFocus = keywords[job.discoveryBatch % keywords.length];

  try {
    const result = await searchCompanies({
      // Don't use free-text org name (too narrow); use keywords + location
      keywords: [kwFocus, ...keywords].slice(0, 6),
      locations: [targetGeo, ...searchAnchorCities(targetGeo).slice(0, 3)].slice(
        0,
        5
      ),
      employeeRanges: ranges.length ? ranges : ['1,10', '11,50', '51,200', '201,500'],
      per_page: Math.min(LIST_BUILDER_DEFAULTS.batchSize * 3, 25),
      page: ((page - 1) % 5) + 1,
    });

    if (result.error) {
      console.warn('[list-builder/apollo]', result.error);
    }

    const out: DiscoverCandidate[] = [];
    for (const c of result.companies || []) {
      const cand = apolloToCandidate(c);
      if (!cand) continue;
      const n = normName(cand.companyName);
      if (!n || exclude.has(n)) continue;
      if (
        !looksInTargetArea(cand.city || cand.state, cand.companyName, targetGeo, {
          allowUnknown: true,
        })
      ) {
        continue;
      }
      // Soft employee filter when Apollo returns a count
      if (cap && cand.employees != null) {
        const nEmp = parseInt(String(cand.employees).replace(/[^0-9]/g, ''), 10);
        if (nEmp > 0 && nEmp > cap * 1.25) continue;
      }
      exclude.add(n);
      out.push(cand);
      if (out.length >= LIST_BUILDER_DEFAULTS.batchSize) break;
    }
    return out;
  } catch (err: any) {
    console.warn('[list-builder/apollo]', err?.message || err);
    return [];
  }
}

async function discoverFromTavily(
  job: ListBuilderJob,
  exclude: Set<string>
): Promise<DiscoverCandidate[]> {
  if (!(process.env.TAVILY_API_KEY || '').trim()) return [];

  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const queries = buildDiscoveryQueries(job, job.discoveryBatch || 0);
  // Two queries per batch for diversity without burning the budget
  const q1 = queries[job.discoveryBatch % queries.length];
  const q2 = queries[(job.discoveryBatch + 1) % queries.length];

  const [r1, r2] = await Promise.all([
    tavilySearch(q1, 8),
    tavilySearch(q2, 6),
  ]);
  const results = [...r1, ...r2];

  const out: DiscoverCandidate[] = [];
  const locals = knownLocalityNames(targetGeo);

  for (const r of results) {
    if (!r.url || !isCompanySite(r.url)) continue;
    const name = companyFromTitle(r.title);
    if (!name || name.length < 3) continue;
    const n = normName(name);
    if (!n || exclude.has(n)) continue;

    // Prefer results that mention a local place or the county
    const hay = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
    const localHit =
      locals.some((loc) => hay.includes(loc)) ||
      localityTokensLoose(targetGeo).some((t) => hay.includes(t));
    if (!localHit && results.length > 3) {
      // Soft skip non-local when we have other hits
      continue;
    }

    const cityGuess =
      locals.find((loc) => hay.includes(loc)) ||
      undefined;

    const signals = extractContactSignals(`${r.title} ${r.snippet}`);
    exclude.add(n);
    out.push({
      companyName: name,
      website: r.url,
      city: cityGuess,
      phone: signals.phones[0],
      email: signals.emails[0],
      source: 'tavily',
    });
    if (out.length >= LIST_BUILDER_DEFAULTS.batchSize) break;
  }

  return out;
}

function localityTokensLoose(targetGeo: string): string[] {
  return targetGeo
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3 && !['county', 'parish', 'united', 'states'].includes(t));
}

/**
 * LLM discovery — now grounded with optional web snippets so it
 * invents fewer off-geo names.
 */
async function discoverFromLlm(
  job: ListBuilderJob,
  excludeNames: string[],
  webHints: Array<{ title: string; url: string; snippet: string }>
): Promise<DiscoverCandidate[]> {
  const targetGeo = resolveTargetGeography(job.brief, job.geography);
  const keywords = inferIndustryKeywords(job.brief, job.industry);
  const anchors = searchAnchorCities(targetGeo).slice(0, 6).join(', ');
  const cap = parseEmployeeCap(job.brief);

  const hintBlock =
    webHints.length > 0
      ? `WEB SEARCH HITS (prefer real companies from these; extract name + website):\n${webHints
          .slice(0, 12)
          .map((h, i) => `${i + 1}. ${h.title} | ${h.url} | ${h.snippet.slice(0, 160)}`)
          .join('\n')}`
      : 'No web hits available — use only companies you are confident are real and local.';

  const system = `You are a B2B research assistant for a recruiting agency.
Return ONLY valid JSON: an array of objects with keys companyName, website (domain preferred), city.
CRITICAL GEOGRAPHY RULES:
- Every company MUST be headquartered or primarily operating in: ${targetGeo}
- Valid cities include: ${anchors || targetGeo}
- Put the real city/town in the "city" field (not the county name alone)
- Do NOT return companies from other states or unrelated metros
- Never invent emails or phones
- Prefer ${keywords.slice(0, 3).join(', ') || 'local'} firms${cap ? ` with under ~${cap} employees` : ''}
Max ${LIST_BUILDER_DEFAULTS.batchSize} companies.
Avoid these names: ${excludeNames.slice(0, 50).join(', ') || '(none)'}`;

  const user = `Brief: ${job.brief}
REQUIRED location (strict): ${targetGeo}
Batch #: ${(job.discoveryBatch || 0) + 1}
Need ${LIST_BUILDER_DEFAULTS.batchSize} DIFFERENT real companies in ${targetGeo} only.
${hintBlock}
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
      queryPreview: `${targetGeo}: ${job.brief || job.industry || ''}`.slice(0, 180),
    },
    { timeoutMs: LIST_BUILDER_DEFAULTS.llmTimeoutMs }
  );

  if (error || !Array.isArray(data)) {
    if (error) throw new Error(`discover: ${error}`);
    return [];
  }

  const mapped: DiscoverCandidate[] = data
    .map((x) => ({
      companyName: String(x.companyName || '').trim(),
      website: x.website ? String(x.website).trim() : undefined,
      city: x.city ? String(x.city).trim() : undefined,
      source: 'llm' as const,
    }))
    .filter((x) => x.companyName);

  // Strict geo filter — do NOT fall back to off-geo list
  const filtered = mapped.filter((x) =>
    looksInTargetArea(x.city, x.companyName, targetGeo, { allowUnknown: true })
  );
  return filtered;
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

/**
 * Discover a batch of company candidates using Apollo → Tavily → LLM.
 */
export async function discoverCompanyCandidates(
  job: ListBuilderJob,
  excludeNames: string[]
): Promise<DiscoverCandidate[]> {
  const exclude = new Set(excludeNames.map(normName).filter(Boolean));
  const need = LIST_BUILDER_DEFAULTS.batchSize;
  const collected: DiscoverCandidate[] = [];

  // 1) Apollo structured search (best geo + size filters)
  const apollo = await discoverFromApollo(job, exclude);
  collected.push(...apollo);

  // 2) Tavily web discovery for real local sites
  if (collected.length < need) {
    const tavily = await discoverFromTavily(job, exclude);
    collected.push(...tavily);
  }

  // 3) LLM with optional Tavily grounding (always try if still short)
  if (collected.length < need) {
    let hints: Array<{ title: string; url: string; snippet: string }> = [];
    if ((process.env.TAVILY_API_KEY || '').trim()) {
      const q = buildDiscoveryQueries(job, job.discoveryBatch || 0)[0];
      hints = await tavilySearch(q, 10);
    }
    try {
      const llm = await discoverFromLlm(job, [...exclude], hints);
      for (const c of llm) {
        const n = normName(c.companyName);
        if (!n || exclude.has(n)) continue;
        exclude.add(n);
        collected.push(c);
      }
    } catch (err) {
      // If we already have some real sources, don't fail the whole batch
      if (collected.length === 0) throw err;
      console.warn('[list-builder] llm discover fallback', err);
    }
  }

  return dedupeCandidates(collected, excludeNames).slice(0, need);
}

/**
 * When site scrape finds no email/phone, search the web for public contacts.
 */
export async function enrichContactFromWeb(
  companyName: string,
  city?: string,
  website?: string
): Promise<{ email?: string; phone?: string; notes?: string }> {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key) return {};

  const place = city || '';
  const queries = [
    `"${companyName}" ${place} phone contact`,
    `"${companyName}" ${place} email OR "contact us"`,
  ];
  if (website) {
    try {
      const host = new URL(
        website.startsWith('http') ? website : `https://${website}`
      ).hostname;
      queries.push(`site:${host} contact phone email`);
    } catch {
      /* ignore */
    }
  }

  const results = (
    await Promise.all(queries.slice(0, 2).map((q) => tavilySearch(q, 5)))
  ).flat();

  const blob = results.map((r) => `${r.title} ${r.snippet}`).join(' ');
  const signals = extractContactSignals(blob);
  const out: { email?: string; phone?: string; notes?: string } = {};
  if (signals.emails[0]) out.email = signals.emails[0];
  if (signals.phones[0]) out.phone = signals.phones[0];
  if (out.email || out.phone) {
    out.notes = 'Contact found via public web search';
  }
  return out;
}

export { tavilySearch };
