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
  /**
   * True when the firm advertises offices/locations outside Florida
   * (used for Florida-only BD targeting — drop multi-state nationals even if HQ is FL).
   */
  hasOfficesOutsideFlorida?: boolean;
  /** Non-FL states/markets detected (labels) */
  outOfStateLabels?: string[];
  /** Cities/areas detected on the page (best-effort) */
  mentions: string[];
  evidence?: string;
};

/**
 * Prefer small–mid market; hard-drop only when headcount clearly exceeds this.
 * (Soft preference stays ~500 in discovery prompts.)
 */
export const SMB_EMPLOYEE_CAP = 750;

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

/** Non-Florida US state tokens (abbrev + full name) for multi-state footprint detection. */
const NON_FL_STATES: Array<{ abbrev: string; name: string }> = [
  { abbrev: 'AL', name: 'Alabama' },
  { abbrev: 'AK', name: 'Alaska' },
  { abbrev: 'AZ', name: 'Arizona' },
  { abbrev: 'AR', name: 'Arkansas' },
  { abbrev: 'CA', name: 'California' },
  { abbrev: 'CO', name: 'Colorado' },
  { abbrev: 'CT', name: 'Connecticut' },
  { abbrev: 'DE', name: 'Delaware' },
  { abbrev: 'GA', name: 'Georgia' },
  { abbrev: 'HI', name: 'Hawaii' },
  { abbrev: 'ID', name: 'Idaho' },
  { abbrev: 'IL', name: 'Illinois' },
  { abbrev: 'IN', name: 'Indiana' },
  { abbrev: 'IA', name: 'Iowa' },
  { abbrev: 'KS', name: 'Kansas' },
  { abbrev: 'KY', name: 'Kentucky' },
  { abbrev: 'LA', name: 'Louisiana' },
  { abbrev: 'ME', name: 'Maine' },
  { abbrev: 'MD', name: 'Maryland' },
  { abbrev: 'MA', name: 'Massachusetts' },
  { abbrev: 'MI', name: 'Michigan' },
  { abbrev: 'MN', name: 'Minnesota' },
  { abbrev: 'MS', name: 'Mississippi' },
  { abbrev: 'MO', name: 'Missouri' },
  { abbrev: 'MT', name: 'Montana' },
  { abbrev: 'NE', name: 'Nebraska' },
  { abbrev: 'NV', name: 'Nevada' },
  { abbrev: 'NH', name: 'New Hampshire' },
  { abbrev: 'NJ', name: 'New Jersey' },
  { abbrev: 'NM', name: 'New Mexico' },
  { abbrev: 'NY', name: 'New York' },
  { abbrev: 'NC', name: 'North Carolina' },
  { abbrev: 'ND', name: 'North Dakota' },
  { abbrev: 'OH', name: 'Ohio' },
  { abbrev: 'OK', name: 'Oklahoma' },
  { abbrev: 'OR', name: 'Oregon' },
  { abbrev: 'PA', name: 'Pennsylvania' },
  { abbrev: 'RI', name: 'Rhode Island' },
  { abbrev: 'SC', name: 'South Carolina' },
  { abbrev: 'SD', name: 'South Dakota' },
  { abbrev: 'TN', name: 'Tennessee' },
  { abbrev: 'TX', name: 'Texas' },
  { abbrev: 'UT', name: 'Utah' },
  { abbrev: 'VT', name: 'Vermont' },
  { abbrev: 'VA', name: 'Virginia' },
  { abbrev: 'WA', name: 'Washington' },
  { abbrev: 'WV', name: 'West Virginia' },
  { abbrev: 'WI', name: 'Wisconsin' },
  { abbrev: 'WY', name: 'Wyoming' },
  { abbrev: 'DC', name: 'District of Columbia' },
];

export function isFloridaTarget(targetGeo: string): boolean {
  return /florida|\bfl\b|broward|brevard|palm\s*beach|miami|dade|hillsborough|pinellas|orange|duval|lee|collier|seminole|volusia|fort\s*lauderdale|ft\.?\s*lauderdale|tampa|orlando|jacksonville|naples/i.test(
    targetGeo || ''
  );
}

/**
 * Detect advertised offices/locations outside Florida.
 * Uses City, ST patterns and location-list context to reduce false positives.
 */
export function detectOfficesOutsideFlorida(pageText: string): string[] {
  const text = (pageText || '').slice(0, 16_000);
  if (!text.trim()) return [];
  const found = new Set<string>();

  // "City, TX" / "City, Texas" — require comma before 2-letter codes so "in" ≠ Indiana
  for (const { abbrev, name } of NON_FL_STATES) {
    const cityStateAbbr = new RegExp(
      `\\b[A-Za-z][a-zA-Z.'-]{2,}(?:\\s+[A-Za-z][a-zA-Z.'-]{2,}){0,2},\\s*${abbrev}\\b`
    );
    const cityStateName = new RegExp(
      `\\b[A-Za-z][a-zA-Z.'-]{2,}(?:\\s+[A-Za-z][a-zA-Z.'-]{2,}){0,2},\\s*${name}\\b`,
      'i'
    );
    if (cityStateAbbr.test(text) || cityStateName.test(text)) found.add(name);
  }

  // Location-context snippets + full state *names* only (not 2-letter codes — avoid "in"/"or"/"me")
  const locContext =
    /(?:offices?|locations?|branches?|headquarters|\bhq\b|regional\s+office|markets?\s+in|nationwide|throughout)\s*[:\s][^.]{0,140}/gi;
  const chunks = text.match(locContext) || [];
  for (const chunk of chunks) {
    for (const { name } of NON_FL_STATES) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(chunk)) found.add(name);
    }
    // Safe abbrevs only after comma or space+uppercase (GA, TX) — not OR/IN/ME/HI as words
    if (/,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|GA|ID|IL|IA|KS|KY|LA|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(chunk)) {
      for (const { abbrev, name } of NON_FL_STATES) {
        if (new RegExp(`,\\s*${abbrev}\\b`).test(chunk)) found.add(name);
      }
    }
  }

  // Explicit multi-state / national footprint language
  if (
    /\b(nationwide|nationally|all\s+50\s+states|multi[-\s]?state|offices\s+in\s+\d+\s+states|locations\s+in\s+\d+\s+states)\b/i.test(
      text
    )
  ) {
    if (
      found.size > 0 ||
      /\b(offices?|locations?)\b.{0,40}\bnationwide\b/i.test(text) ||
      /\bnationwide\b.{0,40}\b(offices?|locations?)\b/i.test(text)
    ) {
      found.add('Nationwide / multi-state');
    }
  }

  // Major metros outside FL with office/address context
  for (const m of MAJOR_FOREIGN_MARKERS) {
    const idx = text.search(m.re);
    if (idx >= 0) {
      const window = text.slice(Math.max(0, idx - 40), idx + 60);
      if (
        /\b(office|location|branch|headquarters|\bhq\b|address|suite|street|st\.|blvd)\b/i.test(
          window
        ) ||
        /,\s*(GA|TX|NY|CA|IL|NC|SC|TN|AL|LA|VA|PA|OH|CO|AZ|WA)\b/.test(window)
      ) {
        found.add(m.label);
      }
    }
  }

  return [...found].slice(0, 8);
}

/**
 * True when firm size is clearly above SMB / mid-market preference.
 */
export function exceedsSmbSize(
  employeeCount?: number,
  companySize?: string,
  cap: number = SMB_EMPLOYEE_CAP
): { tooBig: boolean; reason?: string } {
  if (typeof employeeCount === 'number' && Number.isFinite(employeeCount)) {
    if (employeeCount > cap) {
      return {
        tooBig: true,
        reason: `~${employeeCount} employees exceeds SMB target (≤${cap})`,
      };
    }
  }
  const band = String(companySize || '').replace(/,/g, '');
  // "501-1000", "1000+", "5,000 employees"
  const range = band.match(/(\d{1,6})\s*[-–to]+\s*(\d{1,6})/i);
  if (range) {
    const hi = parseInt(range[2], 10);
    if (hi > cap) {
      return {
        tooBig: true,
        reason: `Size band ${range[1]}-${range[2]} exceeds SMB target (≤${cap})`,
      };
    }
  }
  const plus = band.match(/(\d{1,6})\s*\+/);
  if (plus && parseInt(plus[1], 10) >= cap) {
    return {
      tooBig: true,
      reason: `Size ${plus[1]}+ exceeds SMB target (≤${cap})`,
    };
  }
  if (/\b(enterprise|fortune\s*500|global\s+builder)\b/i.test(band)) {
    return { tooBig: true, reason: 'Enterprise / national scale label' };
  }
  return { tooBig: false };
}

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

  // Florida-market briefs: detect multi-state footprint (offices outside FL)
  const flTarget = isFloridaTarget(targetGeo);
  const outOfState = flTarget ? detectOfficesOutsideFlorida(text) : [];
  const hasOfficesOutsideFlorida = outOfState.length > 0;

  const inTarget = localHits > 0;
  // Off-target if foreign markers and no local evidence
  const offTarget =
    (foreign.length > 0 && localHits === 0) || hasOfficesOutsideFlorida;

  let evidence: string | undefined;
  if (hasOfficesOutsideFlorida) {
    evidence = `Offices outside Florida: ${outOfState.slice(0, 4).join(', ')} — Florida-only target`;
  } else if (foreign.length > 0 && localHits === 0) {
    evidence = `Page suggests ${foreign.slice(0, 3).join(', ')} — outside ${targetGeo}`;
  } else if (inTarget) {
    evidence = `Page mentions local: ${mentions.slice(0, 4).join(', ')}`;
  }

  return {
    inTarget,
    offTarget,
    hasOfficesOutsideFlorida,
    outOfStateLabels: outOfState,
    mentions: [
      ...new Set([...mentions, ...foreign, ...outOfState]),
    ].slice(0, 12),
    evidence,
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
    : {
        inTarget: false,
        offTarget: false,
        hasOfficesOutsideFlorida: false,
        mentions: [] as string[],
      };

  // Hard rule for Florida BD: drop multi-state firms even if HQ / city is in Florida
  if (pageGeo.hasOfficesOutsideFlorida) {
    return {
      keep: false,
      geoVerified: false,
      reason:
        pageGeo.evidence ||
        'Has offices outside Florida — excluded for Florida-local SMB targeting',
      pageGeo,
    };
  }

  // Soften other off-target (e.g. Orlando when targeting Broward): keep FL-only near-market
  // Same-state multi-location is allowed; multi-state was already hard-dropped above.
  if (pageGeo.offTarget) {
    const cityHay0 = [city, state].filter(Boolean).join(', ');
    const cityLocal0 = looksInTargetArea(
      cityHay0 || city,
      companyName || '',
      targetGeo,
      { allowUnknown: true }
    );
    const flTarget = isFloridaTarget(targetGeo);
    const cityIsFl =
      flTarget &&
      (/florida|\bfl\b/i.test(String(state || '')) ||
        /\b(miami|fort\s*lauderdale|orlando|tampa|jacksonville|naples|west\s*palm|boca|hollywood|delray|jupiter|plantation|davie|boynton|wellington)\b/i.test(
          String(city || '')
        ));

    // Florida-only firm serving multiple FL metros → keep (partial geo)
    if (cityLocal0 || cityIsFl || (flTarget && /florida|\bfl\b/i.test(String(state || '')))) {
      return {
        keep: true,
        geoVerified: !!cityLocal0 || !!pageGeo.inTarget,
        reason: cityLocal0
          ? 'Local city; other FL markets on site (OK)'
          : 'Florida firm with multi-metro FL footprint (OK — no out-of-state offices)',
        pageGeo,
      };
    }
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
    // Same-state (e.g. Miami firm for Palm Beach County brief) — keep as partial
    const targetIsFl = /florida|\bfl\b/i.test(targetGeo);
    const cityIsFl =
      /florida|\bfl\b/i.test(String(state || '')) ||
      /\b(miami|fort\s*lauderdale|orlando|tampa|jacksonville|naples|west\s*palm|boca|hollywood|delray|jupiter)\b/i.test(
        String(city || '')
      );
    if (targetIsFl && cityIsFl) {
      return {
        keep: true,
        geoVerified: false,
        reason: `Florida firm in ${cityHay} (near-market for ${targetGeo})`,
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
