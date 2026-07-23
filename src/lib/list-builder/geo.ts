/**
 * Geography helpers for list-builder discovery targeting.
 * @serverOnly
 */

import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

/**
 * Known cities/towns for counties we target often.
 * Used so "Melbourne" counts as in "Brevard County, Florida".
 */
const COUNTY_LOCALITIES: Record<string, string[]> = {
  brevard: [
    'melbourne',
    'palm bay',
    'titusville',
    'cocoa',
    'cocoa beach',
    'rockledge',
    'merritt island',
    'satellite beach',
    'cape canaveral',
    'indialantic',
    'indian harbour beach',
    'melbourne beach',
    'west melbourne',
    'viera',
    'suntree',
    'grant',
    'valkaria',
    'malabar',
    'micco',
    'barefoot bay',
    'port st john',
    'port saint john',
    'sharpes',
    'mims',
    'scottsmoor',
    'patrick space force',
    'patrick afb',
  ],
  /** Missing this map was dropping Fort Lauderdale etc. as "off-geo". */
  broward: [
    'fort lauderdale',
    'ft lauderdale',
    'hollywood',
    'pompano beach',
    'pembroke pines',
    'miramar',
    'coral springs',
    'davie',
    'plantation',
    'sunrise',
    'deerfield beach',
    'weston',
    'tamarac',
    'margate',
    'coconut creek',
    'oakland park',
    'lauderdale lakes',
    'lauderhill',
    'hallandale beach',
    'hallandale',
    'dania beach',
    'dania',
    'cooper city',
    'parkland',
    'wilton manors',
    'lighthouse point',
    'southwest ranches',
    'lauderdale by the sea',
    'lazy lake',
    'sea ranch lakes',
    'hillsboro beach',
    'north lauderdale',
  ],
  'palm beach': [
    'west palm beach',
    'boca raton',
    'boynton beach',
    'delray beach',
    'jupiter',
    'lake worth',
    'greenacres',
    'riviera beach',
    'palm beach gardens',
    'wellington',
    'royal palm beach',
    'belle glade',
    'pahokee',
    'lantana',
    'hypoluxo',
    'palm springs',
    'north palm beach',
    'juno beach',
    'tequesta',
  ],
  orange: [
    'orlando',
    'winter park',
    'apopka',
    'ocoee',
    'winter garden',
    'maitland',
    'eatonville',
  ],
  hillsborough: ['tampa', 'brandon', 'plant city', 'temple terrace', 'ruskin'],
  'miami-dade': [
    'miami',
    'miami beach',
    'hialeah',
    'homestead',
    'coral gables',
    'doral',
    'kendall',
    'cutler bay',
  ],
  miami: [
    'miami',
    'miami beach',
    'hialeah',
    'homestead',
    'coral gables',
    'doral',
    'kendall',
    'cutler bay',
  ],
  duval: ['jacksonville', 'jacksonville beach', 'atlantic beach', 'neptune beach'],
  pinellas: [
    'st petersburg',
    'saint petersburg',
    'clearwater',
    'largo',
    'pinellas park',
    'dunedin',
    'seminole',
  ],
  lee: ['fort myers', 'ft myers', 'cape coral', 'bonita springs', 'estero', 'lehigh acres'],
  collier: ['naples', 'marco island', 'immokalee'],
  seminole: ['sanford', 'altamonte springs', 'casselberry', 'winter springs', 'lake mary', 'oviedo'],
  volusia: ['daytona beach', 'deltona', 'ormond beach', 'port orange', 'new smyrna beach', 'de land', 'deland'],
};

const STATE_ALIASES: Record<string, string[]> = {
  florida: ['florida', 'fl', 'fla'],
  texas: ['texas', 'tx'],
  california: ['california', 'ca', 'calif'],
  georgia: ['georgia', 'ga'],
  'north carolina': ['north carolina', 'nc'],
  'south carolina': ['south carolina', 'sc'],
  'new york': ['new york', 'ny'],
};

/**
 * Prefer a specific place named in the brief over a generic geography field
 * (e.g. brief "…in Brevard County…" + geography "United States" → Brevard County, Florida).
 */
export function resolveTargetGeography(
  brief: string,
  geographyField?: string
): string {
  const geo = (geographyField || '').trim();
  const b = (brief || '').trim();
  const genericGeo =
    !geo ||
    /^(united states|usa|u\.s\.a\.?|u\.s\.|us|nationwide|north america|global|world)$/i.test(
      geo
    );

  const candidates: string[] = [];

  // "in Brevard County" / "in Palm Beach County, FL"
  const inMatch = b.match(
    /\bin\s+([A-Za-z][A-Za-z0-9\s.'-]{2,60}?)(?=\s+(?:with|under|over|and|that|for|looking|please|who|which|having|,|\.|$))/i
  );
  if (inMatch?.[1]) candidates.push(inMatch[1].trim());

  // Standalone "Brevard County" / "Miami-Dade County"
  const countyMatch = b.match(
    /\b([A-Za-z][A-Za-z0-9\s.'-]{1,40}\s+(?:County|Parish))\b/i
  );
  if (countyMatch?.[1]) candidates.push(countyMatch[1].trim());

  // "near Melbourne, FL" / "around Titusville FL"
  const nearMatch = b.match(
    /\b(?:near|around|serving)\s+([A-Za-z][A-Za-z\s.'-]{2,40}?)(?=\s+(?:with|under|area|and|,|\.|$))/i
  );
  if (nearMatch?.[1]) candidates.push(nearMatch[1].trim());

  let place = '';
  for (const c of candidates) {
    const cleaned = c
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]+$/g, '')
      .trim();
    if (cleaned.length >= 3 && cleaned.length <= 80) {
      place = cleaned;
      break;
    }
  }

  if (place) {
    // Normalize well-known Florida counties so discovery prompts are precise
    const flCounties =
      /brevard|broward|palm\s*beach|miami[-\s]?dade|hillsborough|pinellas|orange|duval|lee|collier|seminole|volusia/i;
    if (flCounties.test(place) && !/florida|\bfl\b/i.test(place)) {
      place = `${place.replace(/,?\s*$/, '')}, Florida`;
    }
    if (
      genericGeo ||
      place.toLowerCase().includes(geo.toLowerCase().slice(0, 12))
    ) {
      return place;
    }
    if (geo && !place.toLowerCase().includes(geo.toLowerCase())) {
      return `${place}, ${geo}`;
    }
    return place;
  }

  return geo || LIST_BUILDER_DEFAULTS.geography;
}

function localityTokens(targetGeo: string): string[] {
  return targetGeo
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !['county', 'parish', 'united', 'states', 'usa', 'the', 'and'].includes(
          t
        )
    );
}

/** Known city tokens for the target (county map + tokens from the string itself). */
export function knownLocalityNames(targetGeo: string): string[] {
  const lower = (targetGeo || '').toLowerCase();
  const names = new Set<string>();
  for (const [county, cities] of Object.entries(COUNTY_LOCALITIES)) {
    if (lower.includes(county)) {
      for (const c of cities) names.add(c);
    }
  }
  for (const t of localityTokens(targetGeo)) {
    if (t.length >= 4) names.add(t);
  }
  return [...names];
}

function stateAliasesInTarget(targetGeo: string): string[] {
  const lower = (targetGeo || '').toLowerCase();
  for (const [state, aliases] of Object.entries(STATE_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return aliases;
  }
  return [];
}

/**
 * True when city/name looks local to the target geography.
 * Empty city is allowed (unknown) when `allowUnknown` is true.
 */
export function looksInTargetArea(
  city: string | undefined,
  companyName: string,
  targetGeo: string,
  options?: { allowUnknown?: boolean }
): boolean {
  const allowUnknown = options?.allowUnknown !== false;
  const tokens = localityTokens(targetGeo);
  if (tokens.length === 0) return true;
  if (/^(united states|usa|us|nationwide)$/i.test(targetGeo.trim())) {
    return true;
  }

  const hay = `${city || ''} ${companyName}`.toLowerCase().replace(/\s+/g, ' ');
  const cityOnly = (city || '').toLowerCase().trim();

  // No city given → keep as unknown unless caller wants strict
  if (!cityOnly) return allowUnknown;

  // Direct token hit (brevard, florida, etc.)
  const distinctive = tokens.filter((t) => t.length >= 4);
  if (distinctive.some((t) => hay.includes(t))) return true;

  // Known cities in this county
  const locals = knownLocalityNames(targetGeo);
  if (locals.some((loc) => cityOnly.includes(loc) || hay.includes(loc))) {
    return true;
  }

  // State match alone is weak for multi-city states — only accept if
  // we also see a city-ish token OR the target is the whole state
  const stateAliases = stateAliasesInTarget(targetGeo);
  const targetIsStateOnly =
    stateAliases.length > 0 &&
    !/county|parish|metro|area/i.test(targetGeo) &&
    distinctive.every((t) => stateAliases.includes(t));
  if (targetIsStateOnly && stateAliases.some((a) => hay.includes(a))) {
    return true;
  }

  // "Melbourne, FL" for Brevard target: city in map already handled;
  // reject clear out-of-state markers when we know a target state
  if (stateAliases.length > 0) {
    const foreignState =
      /\b(tx|texas|ca|california|ny|new york|ga|georgia|nc|sc|az|arizona|il|illinois|oh|ohio|pa|pennsylvania|wa|washington)\b/i;
    if (foreignState.test(cityOnly) && !stateAliases.some((a) => cityOnly.includes(a))) {
      // e.g. "Houston, TX" while targeting Florida
      if (!locals.some((loc) => cityOnly.includes(loc))) return false;
    }
  }

  // City present but no local signal → reject (was the silent failure mode)
  return false;
}

/** Parse "under 300 employees" style size caps from a brief. */
export function parseEmployeeCap(brief: string): number | undefined {
  const m = (brief || '').match(
    /\b(?:under|fewer than|less than|below|up to|max(?:imum)?)\s+(\d{1,5})\s*(?:employees?|staff|people|workers)?/i
  );
  if (m?.[1]) return Math.min(parseInt(m[1], 10), 100_000);
  const m2 = (brief || '').match(
    /\b(\d{1,5})\s*(?:employees?|staff)\s*(?:or less|or fewer|max)?/i
  );
  if (m2?.[1] && /\b(under|fewer|less|small|max)/i.test(brief)) {
    return Math.min(parseInt(m2[1], 10), 100_000);
  }
  return undefined;
}

/**
 * Apollo organization_num_employees_ranges for "under N".
 * Apollo uses "min,max" strings.
 */
export function employeeRangesForCap(cap?: number): string[] {
  // Default SMB bands when no cap in the brief
  if (!cap || cap <= 0) {
    return ['1,10', '11,20', '21,50', '51,100', '101,200', '201,500'];
  }
  const bands: Array<[number, number]> = [
    [1, 10],
    [11, 20],
    [21, 50],
    [51, 100],
    [101, 200],
    [201, 500],
    [501, 1000],
  ];
  // Include any band whose lower bound is still under the cap
  return bands
    .filter(([min]) => min < cap)
    .map(([min, max]) => `${min},${max}`)
    .slice(0, 6);
}

/**
 * Industry umbrellas: when the user asks for a parent sector (e.g. "construction companies"),
 * expand to related sub-industries / trades so discovery covers the full category.
 * Works the same for every industry that has an umbrella defined.
 */
const INDUSTRY_UMBRELLAS: Array<{
  /** Matches brief language for this umbrella */
  match: RegExp;
  /** Parent label + related segments to search */
  keywords: string[];
}> = [
  {
    // Parent "construction" OR any related trade still expands the full umbrella
    match:
      /construct|general\s*contract|\bgc\b|builder|building|contractor|remodel|renovat|roof|electric|plumb|hvac|concrete|mason|excav|civil\s*construct|drywall|flooring|framing|carpent|landscap|paving|demolition|design-?build|pool\s*construct|insulation|fire\s*protect/,
    keywords: [
      'construction',
      'general contractor',
      'commercial construction',
      'residential construction',
      'building contractor',
      'design-build',
      'construction management',
      'roofing',
      'roofing contractor',
      'electrical contractor',
      'electrician',
      'plumbing',
      'plumbing contractor',
      'hvac',
      'hvac contractor',
      'concrete',
      'masonry',
      'site work',
      'excavation',
      'civil construction',
      'painting contractor',
      'drywall',
      'flooring contractor',
      'framing',
      'carpentry',
      'landscaping',
      'paving',
      'demolition',
      'fire protection contractor',
      'insulation contractor',
      'window and door contractor',
      'pool construction',
      'home builder',
      'remodeling contractor',
    ],
  },
  {
    match:
      /health|medical|hospital|clinic|dental|pharma|biotech|nursing|home\s*health|physician|urgent\s*care|outpatient|assisted\s*living/,
    keywords: [
      'healthcare',
      'medical',
      'hospital',
      'clinic',
      'physician practice',
      'dental',
      'dental practice',
      'home health',
      'nursing home',
      'assisted living',
      'pharmacy',
      'medical device',
      'behavioral health',
      'urgent care',
      'outpatient',
      'healthcare staffing',
    ],
  },
  {
    match:
      /software|saas|tech\b|information\s*tech|\bit\b|cyber|cloud\b|app\s*dev|msp\b|managed\s*it|fintech|healthtech/,
    keywords: [
      'software',
      'saas',
      'information technology',
      'it services',
      'cybersecurity',
      'cloud services',
      'software development',
      'managed it',
      'msp',
      'web development',
      'data analytics',
      'fintech',
      'healthtech',
    ],
  },
  {
    match: /manufactur|factory|industrial\s*product|fabricat|machine\s*shop/,
    keywords: [
      'manufacturing',
      'fabrication',
      'machine shop',
      'industrial manufacturing',
      'metal fabrication',
      'plastics manufacturing',
      'electronics manufacturing',
      'food manufacturing',
      'contract manufacturing',
      'assembly',
    ],
  },
  {
    match: /logistic|warehous|freight|trucking|shipping|supply\s*chain|distribution/,
    keywords: [
      'logistics',
      'trucking',
      'warehousing',
      'freight',
      'distribution',
      'supply chain',
      'third party logistics',
      '3pl',
      'courier',
      'last mile delivery',
    ],
  },
  {
    match: /staffing|recruit|talent\s*acquis|workforce|temp\s*agenc/,
    keywords: [
      'staffing',
      'recruiting',
      'employment agency',
      'workforce solutions',
      'temporary staffing',
      'executive search',
      'healthcare staffing',
      'it staffing',
      'light industrial staffing',
    ],
  },
  {
    match: /real\s*estate|propert(?:y|ies)|brokerage|commercial\s*re\b|multifamily/,
    keywords: [
      'real estate',
      'commercial real estate',
      'property management',
      'real estate brokerage',
      'multifamily',
      'residential real estate',
      'development',
      'leasing',
    ],
  },
  {
    match: /hospitalit|hotel|restaurant|food\s*service|catering|resort/,
    keywords: [
      'hospitality',
      'hotel',
      'restaurant',
      'food service',
      'catering',
      'resort',
      'bar and grill',
      'quick service restaurant',
    ],
  },
  {
    match: /financ|bank|credit\s*union|account|cpa\b|insurance|wealth/,
    keywords: [
      'financial services',
      'banking',
      'accounting',
      'cpa firm',
      'insurance',
      'insurance agency',
      'wealth management',
      'mortgage',
      'bookkeeping',
    ],
  },
  {
    match: /legal|law\s*firm|attorney|lawyer/,
    keywords: [
      'law firm',
      'legal services',
      'attorney',
      'litigation',
      'corporate law',
      'personal injury law',
    ],
  },
  {
    match: /retail|e-?commerce|store\b|shop\b/,
    keywords: [
      'retail',
      'ecommerce',
      'consumer retail',
      'specialty retail',
      'wholesale',
    ],
  },
  {
    match: /education|school|university|training|edtech/,
    keywords: [
      'education',
      'private school',
      'tutoring',
      'corporate training',
      'edtech',
      'childcare',
    ],
  },
];

/**
 * Industry / segment keywords inferred from a free-text brief.
 * Parent-sector asks (e.g. "construction companies") expand to the full umbrella
 * of related trades/segments. Specific asks (e.g. "roofing") still add the parent
 * umbrella so related firms can surface.
 */
export function inferIndustryKeywords(brief: string, industryField?: string): string[] {
  const b = `${brief || ''} ${industryField || ''}`.toLowerCase();
  const out = new Set<string>();
  if (industryField?.trim()) out.add(industryField.trim());

  let matchedUmbrella = false;
  for (const um of INDUSTRY_UMBRELLAS) {
    if (um.match.test(b)) {
      matchedUmbrella = true;
      for (const k of um.keywords) out.add(k);
    }
  }

  // Lightweight extras if user named a niche not fully covered above
  const extras: Array<[RegExp, string[]]> = [
    [/solar|renewable/, ['solar contractor', 'renewable energy']],
    [/security\s*system|alarm/, ['security systems', 'low voltage contractor']],
    [/janitor|cleaning|facility\s*mainten/, ['janitorial', 'facility maintenance']],
  ];
  for (const [re, kws] of extras) {
    if (re.test(b)) kws.forEach((k) => out.add(k));
  }

  if (!matchedUmbrella && out.size === 0) {
    // Generic "companies in X" — use remaining free-text nouns lightly
    out.add('construction');
  }

  // Enough terms to rotate across discovery batches (focusKw cycles)
  return [...out].slice(0, 24);
}

/** Anchor cities for search query rotation in a target geo. */
export function searchAnchorCities(targetGeo: string): string[] {
  const lower = (targetGeo || '').toLowerCase();
  for (const [county, cities] of Object.entries(COUNTY_LOCALITIES)) {
    if (lower.includes(county)) return cities.slice(0, 8);
  }
  // Fall back to first distinctive token
  const tokens = localityTokens(targetGeo);
  return tokens.length ? [tokens.join(' ')] : [targetGeo];
}
