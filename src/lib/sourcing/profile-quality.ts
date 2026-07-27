/**
 * Heuristics to reduce fake / thin / LLM-hallucinated people in sourcing results.
 * Does NOT require LinkedIn — prefers real-looking employment signals.
 */

export type QualityInput = {
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  source?: string;
  snippet?: string;
};

export type QualityResult = {
  score: number; // 0–100
  keep: boolean;
  reasons: string[];
  flags: string[];
};

const FAKE_NAME_RE =
  /^(john|jane)\s+(doe|smith)$|test user|sample person|lorem|asdf|xxx|fake|n\/a|unknown person/i;

const FAKE_COMPANY_RE =
  /precision dynamics|acme corp|example inc|test company|fake co|placeholder|globex|initech|umbrella corporation|wayne enterprises|stark industries/i;

const THIN_TITLE_RE =
  /^(employee|worker|professional|consultant|specialist|manager|director)$/i;

/** Common LLM-ish / stock names that often appear without real org signal */
const SUSPICIOUS_COMBO_NAMES = new Set(
  [
    'sarah mitchell',
    'james chen',
    'rebecca torres',
    'michael patel',
    'jennifer walsh',
    'david nguyen',
    'emily garcia',
    'christopher lee',
    'amanda brown',
    'robert kim',
  ].map((s) => s.toLowerCase())
);

function nameParts(name: string): string[] {
  return name
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function looksLikeRealPersonName(name: string): boolean {
  const n = (name || '').trim();
  if (n.length < 4 || n.length > 80) return false;
  if (FAKE_NAME_RE.test(n)) return false;
  if (
    /resume examples|how to|careers|guide for|deep dive|linkedin careers/i.test(
      n
    )
  ) {
    return false;
  }
  const parts = nameParts(n);
  if (parts.length < 2 || parts.length > 5) return false;
  if (!parts.every((p) => /^[A-Za-z][A-Za-z'.-]{0,30}$/.test(p))) return false;
  // Reject "A B" single-letter tokens
  if (parts.some((p) => p.length === 1)) return false;
  return true;
}

/**
 * Score a candidate for authenticity / outreach readiness.
 * keep=false → drop from primary results.
 */
export function scoreProfileQuality(p: QualityInput): QualityResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 40;

  const name = (p.name || '').trim();
  const title = (p.title || '').trim();
  const company = (p.company || '').trim();
  const location = (p.location || '').trim();
  const source = (p.source || '').toLowerCase();
  const linkedin = (p.linkedinUrl || p.url || '').trim();
  const email = (p.email || '').trim();

  if (!looksLikeRealPersonName(name)) {
    return {
      score: 5,
      keep: false,
      reasons: ['Name does not look like a real person'],
      flags: ['bad_name'],
    };
  }
  score += 15;
  reasons.push('Real-looking name');

  if (FAKE_COMPANY_RE.test(company)) {
    flags.push('suspicious_company');
    score -= 35;
    reasons.push('Company name looks placeholder/fictional');
  }

  if (company && company.length >= 2) {
    score += 20;
    reasons.push('Has employer');
  } else {
    flags.push('no_company');
    score -= 15;
    reasons.push('No company');
  }

  if (title && title.length >= 3) {
    score += 10;
    if (THIN_TITLE_RE.test(title)) {
      flags.push('thin_title');
      score -= 8;
    }
  } else {
    flags.push('no_title');
    score -= 10;
  }

  if (location) {
    score += 8;
    reasons.push('Has location');
  }

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    score += 12;
    reasons.push('Has email');
  }

  if (p.phone && String(p.phone).replace(/\D/g, '').length >= 7) {
    score += 8;
    reasons.push('Has phone');
  }

  // LinkedIn is a bonus, not required
  if (linkedin && /linkedin\.com\/in\//i.test(linkedin)) {
    score += 10;
    reasons.push('Has LinkedIn profile URL');
    // Suspicious vanity paths
    if (/linkedin\.com\/in\/(test|fake|user\d+|sample)/i.test(linkedin)) {
      flags.push('bad_linkedin');
      score -= 20;
    }
  }

  // Source trust
  if (source === 'apollo' || source === 'pdl') {
    score += 15;
    reasons.push('From people database');
  } else if (source === 'llm' || source === 'web') {
    score -= 20;
    flags.push('unverified_source');
    reasons.push('Unverified LLM/web source — verify before outreach');
    if (SUSPICIOUS_COMBO_NAMES.has(name.toLowerCase()) && !company) {
      score -= 15;
      flags.push('stock_name');
    }
    if (SUSPICIOUS_COMBO_NAMES.has(name.toLowerCase()) && FAKE_COMPANY_RE.test(company)) {
      score -= 25;
      flags.push('likely_hallucination');
    }
  }

  // Require minimum employment signal for keep
  const hasEmploymentSignal = !!(company || (title && location) || email);
  if (!hasEmploymentSignal) {
    flags.push('no_employment_signal');
    score -= 20;
  }

  // Hard drop: LLM without company + title
  if (
    (source === 'llm' || source === 'web') &&
    (!company || company.length < 2) &&
    (!title || title.length < 3)
  ) {
    return {
      score: Math.min(score, 15),
      keep: false,
      reasons: ['Unverified profile with no company/title'],
      flags: [...flags, 'drop_thin_llm'],
    };
  }

  // Hard drop: fictional company + LLM
  if ((source === 'llm' || source === 'web') && FAKE_COMPANY_RE.test(company)) {
    return {
      score: 10,
      keep: false,
      reasons: ['Likely fabricated company name'],
      flags: [...flags, 'drop_fake_company'],
    };
  }

  const keep = score >= 45 && hasEmploymentSignal;
  if (!keep && !reasons.some((r) => r.includes('drop'))) {
    reasons.push('Below quality threshold');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    keep,
    reasons,
    flags,
  };
}

export function filterAndRankByQuality<T extends QualityInput>(
  people: T[],
  options?: { minScore?: number; preferDbSources?: boolean }
): Array<T & { qualityScore: number; qualityFlags: string[] }> {
  const minScore = options?.minScore ?? 45;
  const scored = people
    .map((p) => {
      const q = scoreProfileQuality(p);
      return {
        ...p,
        qualityScore: q.score,
        qualityFlags: q.flags,
        _keep: q.keep && q.score >= minScore,
      };
    })
    .filter((p) => p._keep);

  scored.sort((a, b) => {
    if (options?.preferDbSources !== false) {
      const rank = (s?: string) =>
        s === 'apollo' ? 0 : s === 'pdl' ? 1 : s === 'llm' ? 2 : 3;
      const dr = rank(a.source) - rank(b.source);
      if (dr !== 0) return dr;
    }
    return (b.qualityScore || 0) - (a.qualityScore || 0);
  });

  return scored.map(({ _keep, ...rest }) => rest as T & {
    qualityScore: number;
    qualityFlags: string[];
  });
}
