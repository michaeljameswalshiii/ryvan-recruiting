/**
 * Quality gates for list-builder: live website + geo evidence.
 * @serverOnly
 */

import { fetchPageText } from './fetch-page';
import {
  knownLocalityNames,
  looksInTargetArea,
  resolveTargetGeography,
} from './geo';

export type SiteReachability = {
  ok: boolean;
  finalUrl?: string;
  error?: string;
  /** Short label for notes / UI */
  reason?: string;
};

export type PageGeoEvidence = {
  /** True when page text supports the target market */
  inTarget: boolean;
  /** True when page clearly indicates a different metro/state */
  offTarget: boolean;
  /** Cities/areas detected on the page (best-effort) */
  mentions: string[];
  evidence?: string;
};

export type VerificationTier = 'verified' | 'partial' | 'unverified';

export type RowVerification = {
  siteVerified: boolean;
  geoVerified: boolean;
  verificationStatus: VerificationTier;
  verificationNotes?: string;
  website?: string;
};

const SITE_TIMEOUT_MS = 7_000;

/**
 * US metros / cities that frequently pollute FL South lists when model is loose.
 * Used only as off-target *hints* when target is a specific FL county/metro.
 */
const MAJOR_FOREIGN_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\batlanta\b/i, label: 'Atlanta' },
  { re: /\bhouston\b/i, label: 'Houston' },
  { re: /\bdallas\b/i, label: 'Dallas' },
  { re: /\baustin\b/i, label: 'Austin' },
  { re: /\bchicago\b/i, label: 'Chicago' },
  { re: /\bnew\s*york\b|\bnyc\b/i, label: 'New York' },
  { re: /\blos\s*angeles\b|\b\bLA\b/i, label: 'Los Angeles' },
  { re: /\bphoenix\b/i, label: 'Phoenix' },
  { re: /\bdenver\b/i, label: 'Denver' },
  { re: /\bseattle\b/i, label: 'Seattle' },
  { re: /\bnashville\b/i, label: 'Nashville' },
  { re: /\bcharlotte\b/i, label: 'Charlotte' },
];

/** Florida cities outside a Broward/Palm Beach/Miami focus when targeting those. */
const FL_CROSS_METRO: Array<{ re: RegExp; label: string; counties: string[] }> =
  [
    {
      re: /\borlando\b/i,
      label: 'Orlando',
      counties: ['orange', 'seminole', 'osceola'],
    },
    {
      re: /\btampa\b/i,
      label: 'Tampa',
      counties: ['hillsborough', 'pinellas'],
    },
    {
      re: /\bjacksonville\b/i,
      label: 'Jacksonville',
      counties: ['duval'],
    },
    {
      re: /\bnaples\b/i,
      label: 'Naples',
      counties: ['collier'],
    },
    {
      re: /\bfort\s*myers\b|\bft\.?\s*myers\b/i,
      label: 'Fort Myers',
      counties: ['lee'],
    },
    {
      re: /\bdaytona\b/i,
      label: 'Daytona',
      counties: ['volusia'],
    },
    {
      re: /\btallahassee\b/i,
      label: 'Tallahassee',
      counties: ['leon'],
    },
  ];

function normalizeUrl(raw: string): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (!s.includes('.') || s.includes(' ')) return null;
    s = `https://${s.replace(/^\/\//, '')}`;
  }
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * HEAD/GET homepage — must succeed for keep. Follows redirects; stores final URL.
 */
export async function verifyWebsiteReachable(
  website: string | undefined
): Promise<SiteReachability> {
  const url = normalizeUrl(website || '');
  if (!url) {
    return { ok: false, error: 'missing_website', reason: 'No website' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_TIMEOUT_MS);
  try {
    // Prefer GET — many contractor hosts reject HEAD
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TrioListBuilder/1.2; +https://turnkey-optimization.vercel.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    const finalUrl = res.url || url;
    if (!res.ok) {
      return {
        ok: false,
        finalUrl,
        error: `http_${res.status}`,
        reason: `Site HTTP ${res.status}`,
      };
    }
    // Soft body check — empty/error pages
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('html') && !ct.includes('text') && !ct.includes('xml')) {
      // Still accept (some sites return odd CT)
    }
    return { ok: true, finalUrl, reason: 'Site reachable' };
  } catch (err: any) {
    const msg = String(err?.message || err || 'fetch_failed');
    const dns =
      /ENOTFOUND|EAI_AGAIN|getaddrinfo|NXDOMAIN|Name not resolved|dns/i.test(
        msg
      );
    return {
      ok: false,
      error: dns ? 'dns' : err?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      reason: dns
        ? 'Domain does not resolve (NXDOMAIN)'
        : err?.name === 'AbortError'
          ? 'Site timeout'
          : `Site unreachable: ${msg.slice(0, 80)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scan page text for local vs clearly foreign location evidence.
 */
export function analyzePageGeo(
  pageText: string,
  targetGeo: string
): PageGeoEvidence {
  const text = (pageText || '').slice(0, 14_000);
  if (!text.trim()) {
    return { inTarget: false, offTarget: false, mentions: [] };
  }

  const lowerGeo = (targetGeo || '').toLowerCase();
  const locals = knownLocalityNames(targetGeo);
  const mentions: string[] = [];

  // Local hits
  let localHits = 0;
  for (const loc of locals) {
    if (loc.length < 4) continue;
    const re = new RegExp(
      `\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i'
    );
    if (re.test(text)) {
      localHits++;
      mentions.push(loc);
    }
  }
  // County / state tokens from target
  if (/broward/i.test(lowerGeo) && /\bbroward\b/i.test(text)) {
    localHits++;
    mentions.push('broward');
  }
  if (/palm\s*beach/i.test(lowerGeo) && /\bpalm\s*beach\b/i.test(text)) {
    localHits++;
    mentions.push('palm beach');
  }
  if (/brevard/i.test(lowerGeo) && /\bbrevard\b/i.test(text)) {
    localHits++;
    mentions.push('brevard');
  }
  if (
    /florida|\bfl\b/i.test(lowerGeo) &&
    /\bflorida\b|\bFL\b/.test(text) &&
    localHits === 0
  ) {
    // State alone is weak for county targets
  }

  // Foreign major metros (always suspicious for narrow FL county briefs)
  const foreign: string[] = [];
  const specificTarget =
    /county|parish|broward|brevard|palm\s*beach|miami|fort\s*lauderdale|ft\.?\s*lauderdale/i.test(
      lowerGeo
    );

  if (specificTarget) {
    for (const m of MAJOR_FOREIGN_MARKERS) {
      if (m.re.test(text)) {
        foreign.push(m.label);
      }
    }
    for (const m of FL_CROSS_METRO) {
      // If target is already that county, not foreign
      if (m.counties.some((c) => lowerGeo.includes(c))) continue;
      if (m.re.test(text)) foreign.push(m.label);
    }
  }

  const inTarget = localHits > 0;
  // Off-target if foreign markers and no local evidence
  const offTarget = foreign.length > 0 && localHits === 0;

  return {
    inTarget,
    offTarget,
    mentions: [...new Set([...mentions, ...foreign])].slice(0, 12),
    evidence: offTarget
      ? `Page suggests ${foreign.slice(0, 3).join(', ')} — outside ${targetGeo}`
      : inTarget
        ? `Page mentions local: ${mentions.slice(0, 4).join(', ')}`
        : undefined,
  };
}

/**
 * Combined city-field + page-text geo decision for keep/drop.
 */
export function evaluateGeoForKeep(opts: {
  city?: string;
  state?: string;
  companyName?: string;
  targetGeo: string;
  pageText?: string;
  /** When true, unknown geo may still keep (partial). Never when off-target. */
  allowUnknownGeo: boolean;
}): {
  keep: boolean;
  geoVerified: boolean;
  reason?: string;
  pageGeo?: PageGeoEvidence;
} {
  const {
    city,
    state,
    companyName,
    targetGeo,
    pageText,
    allowUnknownGeo,
  } = opts;

  const pageGeo = pageText
    ? analyzePageGeo(pageText, targetGeo)
    : { inTarget: false, offTarget: false, mentions: [] as string[] };

  // Hard reject: page clearly elsewhere
  if (pageGeo.offTarget) {
    return {
      keep: false,
      geoVerified: false,
      reason: pageGeo.evidence || 'Off-target location on website',
      pageGeo,
    };
  }

  const cityHay = [city, state].filter(Boolean).join(', ');
  const cityLooksLocal = looksInTargetArea(cityHay || city, companyName || '', targetGeo, {
    allowUnknown: true,
  });
  const cityKnown = !!(city && city.trim());

  // Explicit city field outside target (e.g. Atlanta)
  if (cityKnown && !cityLooksLocal) {
    // If page says local, trust page over model city label
    if (pageGeo.inTarget) {
      return {
        keep: true,
        geoVerified: true,
        reason: 'Website location matches target (city field corrected)',
        pageGeo,
      };
    }
    return {
      keep: false,
      geoVerified: false,
      reason: `Listed city "${cityHay}" outside ${targetGeo}`,
      pageGeo,
    };
  }

  if (pageGeo.inTarget || (cityKnown && cityLooksLocal)) {
    return {
      keep: true,
      geoVerified: true,
      reason: pageGeo.inTarget
        ? pageGeo.evidence
        : `City ${cityHay} in target area`,
      pageGeo,
    };
  }

  // Unknown geo
  if (allowUnknownGeo) {
    return {
      keep: true,
      geoVerified: false,
      reason: 'Location not confirmed on site — partial',
      pageGeo,
    };
  }

  return {
    keep: false,
    geoVerified: false,
    reason: 'Could not confirm location in target market',
    pageGeo,
  };
}

export function tierFromFlags(
  siteVerified: boolean,
  geoVerified: boolean,
  hasContact: boolean
): VerificationTier {
  if (!hasContact) return 'unverified';
  if (siteVerified && geoVerified) return 'verified';
  if (siteVerified && hasContact) return 'partial';
  return 'unverified';
}

/**
 * Fetch homepage text for geo analysis (lightweight single page).
 */
export async function fetchHomepageTextForGeo(
  website: string
): Promise<{ text: string; url: string } | { error: string }> {
  const page = await fetchPageText(website);
  if ('error' in page) return { error: page.error };
  return { text: page.text, url: page.url };
}

export function resolveJobTargetGeo(brief: string, geography?: string): string {
  return resolveTargetGeography(brief, geography);
}
