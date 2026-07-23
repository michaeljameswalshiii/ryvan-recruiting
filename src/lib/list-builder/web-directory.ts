/**
 * Lightweight public web discovery without Apollo/Tavily/xAI web_search.
 * Uses DuckDuckGo HTML results + optional known directory pages.
 * @serverOnly
 */

import { extractContactSignals, fetchPageText } from './fetch-page';
import { knownLocalityNames, searchAnchorCities } from './geo';
import type { DiscoverCandidate } from './discover-sources';

const SKIP_HOST =
  /duckduckgo|google\.|bing\.|yahoo\.|facebook\.|linkedin\.|yelp\.|wikipedia\.|youtube\.|instagram\.|twitter\.|x\.com|amazon\.|ebay\.|craigslist|indeed\.|glassdoor|zoominfo|apollo\.io|crunchbase|mapquest|apple\.com|microsoft\.|cloudflare/i;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function companyFromHost(host: string): string {
  const base = host.replace(/^www\./, '').split('.')[0] || host;
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Parse hrefs out of DuckDuckGo HTML (or any SERP-like page).
 */
function extractLinksFromHtml(html: string): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  // uddg redirect links
  const uddg = [
    ...html.matchAll(
      /uddg=([^&"']+).*?>([\s\S]*?)<\/a>/gi
    ),
  ];
  for (const m of uddg) {
    try {
      const href = decodeURIComponent(m[1]);
      const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (href.startsWith('http')) out.push({ href, title });
    } catch {
      /* ignore */
    }
  }
  // plain anchors
  const anchors = [
    ...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ];
  for (const m of anchors) {
    const href = m[1];
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (href.startsWith('http')) out.push({ href, title });
  }
  return out;
}

async function fetchHtml(url: string, timeoutMs = 10_000): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Search DuckDuckGo HTML for local companies. No API key.
 */
export async function searchWebForCompanies(params: {
  query: string;
  targetGeo: string;
  need: number;
}): Promise<DiscoverCandidate[]> {
  const q = encodeURIComponent(params.query);
  const urls = [
    `https://html.duckduckgo.com/html/?q=${q}`,
    `https://lite.duckduckgo.com/lite/?q=${q}`,
  ];

  const candidates: DiscoverCandidate[] = [];
  const seen = new Set<string>();

  for (const searchUrl of urls) {
    if (candidates.length >= params.need * 2) break;
    const html = await fetchHtml(searchUrl);
    if (!html) continue;
    const links = extractLinksFromHtml(html);
    for (const link of links) {
      const host = domainOf(link.href);
      if (!host || SKIP_HOST.test(host)) continue;
      if (seen.has(host)) continue;
      seen.add(host);
      // Prefer company-looking titles; fall back to host-derived name
      let name = link.title
        .replace(/\s*[\-|–—|].*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.length < 3 || name.length > 80 || /^(http|www\.)/i.test(name)) {
        name = companyFromHost(host);
      }
      if (name.length < 2) continue;
      candidates.push({
        companyName: name,
        website: `https://${host}`,
        source: 'grok-browse',
      });
      if (candidates.length >= params.need * 3) break;
    }
  }

  return candidates.slice(0, params.need * 3);
}

/**
 * Build a few focused queries for the market + rotate by batch.
 */
export function buildDirectoryQueries(opts: {
  brief: string;
  targetGeo: string;
  industry?: string;
  keywords: string[];
  batch: number;
}): string[] {
  const anchors = searchAnchorCities(opts.targetGeo).slice(0, 6);
  const cities = knownLocalityNames(opts.targetGeo).slice(0, 8);
  const focus =
    anchors[(opts.batch - 1) % Math.max(anchors.length, 1)] ||
    cities[(opts.batch - 1) % Math.max(cities.length, 1)] ||
    opts.targetGeo;
  const kw =
    opts.keywords[(opts.batch - 1) % Math.max(opts.keywords.length, 1)] ||
    opts.industry ||
    'construction';

  return [
    `${kw} companies ${focus} Florida contact phone`,
    `${kw} contractors ${opts.targetGeo} website`,
    `${focus} ${kw} company "contact us"`,
    `${kw} firm ${focus} FL phone`,
  ];
}
