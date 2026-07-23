/**
 * Curated local company seeds for list-builder when live web search is blocked.
 * Domains are real public sites; contacts are filled only after site crawl.
 * @serverOnly
 */

export type SeedFirm = {
  companyName: string;
  website: string;
  city: string;
  state: string;
  industry?: string;
};

/** Rotated by discovery batch so jobs don't re-see the same firms forever. */
const PALM_BEACH: SeedFirm[] = [
  {
    companyName: 'Kaufman Lynn Construction',
    website: 'https://www.kaufmanlynn.com',
    city: 'Boca Raton',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Weitz Construction',
    website: 'https://www.weitz.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Coastal Construction Group',
    website: 'https://www.coastalconstruction.com',
    city: 'Miami',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Moss & Associates',
    website: 'https://www.moss.com',
    city: 'Fort Lauderdale',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Robins & Morton',
    website: 'https://www.robinsmorton.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Suffolk Construction',
    website: 'https://www.suffolk.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Turner Construction',
    website: 'https://www.turnerconstruction.com',
    city: 'Miami',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'The Related Group',
    website: 'https://www.relatedgroup.com',
    city: 'Miami',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Itasca Construction Associates',
    website: 'https://www.itascaconstruction.com',
    city: 'Boca Raton',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Hedrick Brothers Construction',
    website: 'https://www.hedrickbrothers.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Current Builders',
    website: 'https://www.currentbuilders.com',
    city: 'Fort Lauderdale',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Catalfumo Construction',
    website: 'https://www.catalfumo.com',
    city: 'Palm Beach Gardens',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Pirtle Construction',
    website: 'https://www.pirtle.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'James A Cummings Inc',
    website: 'https://www.jacinc.com',
    city: 'Fort Lauderdale',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Stiles Corporation',
    website: 'https://www.stiles.com',
    city: 'Fort Lauderdale',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'DPR Construction',
    website: 'https://www.dpr.com',
    city: 'Miami',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Brasfield & Gorrie',
    website: 'https://www.brasfieldgorrie.com',
    city: 'Orlando',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Ajax Building Company',
    website: 'https://www.ajaxbuilding.com',
    city: 'Tampa',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Wharton-Smith Inc',
    website: 'https://www.whartonsmith.com',
    city: 'Sanford',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Walbridge',
    website: 'https://www.walbridge.com',
    city: 'Tampa',
    state: 'FL',
    industry: 'construction',
  },
];

const BREVARD: SeedFirm[] = [
  {
    companyName: 'ICI Homes',
    website: 'https://www.icihomes.com',
    city: 'Daytona Beach',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Haskell',
    website: 'https://www.haskell.com',
    city: 'Jacksonville',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'A. Duda & Sons',
    website: 'https://www.duda.com',
    city: 'Oviedo',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Wharton-Smith Inc',
    website: 'https://www.whartonsmith.com',
    city: 'Sanford',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Brasfield & Gorrie',
    website: 'https://www.brasfieldgorrie.com',
    city: 'Orlando',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Turner Construction',
    website: 'https://www.turnerconstruction.com',
    city: 'Orlando',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'The Weitz Company',
    website: 'https://www.weitz.com',
    city: 'Orlando',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Kaufman Lynn Construction',
    website: 'https://www.kaufmanlynn.com',
    city: 'Boca Raton',
    state: 'FL',
    industry: 'construction',
  },
];

const COLLIER_LEE: SeedFirm[] = [
  {
    companyName: 'Owen-Ames-Kimball Company',
    website: 'https://www.o-a-k.com',
    city: 'Fort Myers',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Wright Construction Group',
    website: 'https://www.wrightconstruction.com',
    city: 'Fort Myers',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Manhattan Construction',
    website: 'https://www.manhattanconstruction.com',
    city: 'Tampa',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Ajax Building Company',
    website: 'https://www.ajaxbuilding.com',
    city: 'Tampa',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Walbridge',
    website: 'https://www.walbridge.com',
    city: 'Tampa',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Moss & Associates',
    website: 'https://www.moss.com',
    city: 'Fort Lauderdale',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Kaufman Lynn Construction',
    website: 'https://www.kaufmanlynn.com',
    city: 'Boca Raton',
    state: 'FL',
    industry: 'construction',
  },
  {
    companyName: 'Weitz Construction',
    website: 'https://www.weitz.com',
    city: 'West Palm Beach',
    state: 'FL',
    industry: 'construction',
  },
];

const FL_GENERAL: SeedFirm[] = [
  ...PALM_BEACH,
  ...BREVARD,
  ...COLLIER_LEE,
];

/**
 * Pick a batch of seed firms matching geography tokens in the brief.
 */
export function getSeedFirmsForMarket(
  targetGeo: string,
  brief: string,
  batchIndex: number,
  need: number,
  excludeNames: string[]
): SeedFirm[] {
  const g = `${targetGeo} ${brief}`.toLowerCase();
  let pool: SeedFirm[] = FL_GENERAL;

  if (/palm\s*beach|boca|delray|jupiter|wellington|boynton/.test(g)) {
    pool = [...PALM_BEACH, ...FL_GENERAL];
  } else if (/broward|lauderdale|hollywood|pompano|davie|weston|miramar/.test(g)) {
    pool = [...PALM_BEACH, ...FL_GENERAL];
  } else if (/collier|naples|marco/.test(g)) {
    pool = [...COLLIER_LEE, ...FL_GENERAL];
  } else if (/lee\b|fort\s*myers|cape\s*coral/.test(g)) {
    pool = [...COLLIER_LEE, ...FL_GENERAL];
  } else if (/brevard|melbourne|cocoa|titusville|palm\s*bay/.test(g)) {
    pool = [...BREVARD, ...FL_GENERAL];
  } else if (/florida|\bfl\b/.test(g)) {
    pool = FL_GENERAL;
  }

  const exclude = new Set(
    excludeNames.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  const filtered = pool.filter((f) => {
    const key = f.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key && !exclude.has(key);
  });

  if (!filtered.length) return [];

  // Rotate window by batch so consecutive ticks get different firms
  const start = ((Math.max(0, batchIndex - 1) * need) % filtered.length);
  const out: SeedFirm[] = [];
  for (let i = 0; i < Math.min(need * 2, filtered.length); i++) {
    out.push(filtered[(start + i) % filtered.length]);
  }
  return out;
}

/**
 * Guess likely domains from a company name, try until one is reachable.
 */
export function guessDomainsFromName(companyName: string): string[] {
  const base = companyName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(inc|llc|ltd|co|corp|corporation|company|group|associates|construction|builders?|contractors?)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base.length < 3) return [];
  const compact = base.replace(/\s+/g, '');
  const dashed = base.replace(/\s+/g, '-');
  const variants = [
    `${compact}.com`,
    `${dashed}.com`,
    `${compact}construction.com`,
    `${dashed}-construction.com`,
    `${compact}builders.com`,
    `www.${compact}.com`,
  ];
  return [...new Set(variants)].map((d) =>
    d.startsWith('www.') ? `https://${d}` : `https://${d}`
  );
}
