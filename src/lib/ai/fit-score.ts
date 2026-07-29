/**
 * Deterministic + light-heuristic candidate↔job fit scorer.
 * No Bedrock/LLM required for base score (optional polish later).
 *
 * Pure functions — no DynamoDB / server deps.
 */

export type FitGrade = "A" | "B" | "C" | "D" | "F";

export interface FitScoreResult {
  score: number; // 0-100
  grade: FitGrade;
  reasons: string[];
  strengths: string[];
  gaps: string[];
  skillsMatched: string[];
  skillsMissing: string[];
}

export interface FitCandidateInput {
  skills?: string[];
  title?: string;
  summary?: string;
  experience?: Array<{
    company?: string;
    title?: string;
    dates?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  location?: string;
}

export interface FitJobInput {
  title?: string;
  description?: string;
  location?: string;
  salaryRange?: string;
}

/** Common skill aliases → canonical form */
const SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  "java script": "javascript",
  ts: "typescript",
  "type script": "typescript",
  "react.js": "react",
  reactjs: "react",
  "react native": "react native",
  "node.js": "node.js",
  nodejs: "node.js",
  node: "node.js",
  "next.js": "next.js",
  nextjs: "next.js",
  "vue.js": "vue",
  vuejs: "vue",
  "angular.js": "angular",
  angularjs: "angular",
  aws: "amazon web services",
  amazon: "amazon web services",
  gcp: "google cloud",
  "google cloud platform": "google cloud",
  gcloud: "google cloud",
  azure: "microsoft azure",
  msft: "microsoft",
  k8s: "kubernetes",
  kube: "kubernetes",
  "ci/cd": "ci/cd",
  cicd: "ci/cd",
  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  "mongo db": "mongodb",
  mssql: "sql server",
  "sql server": "sql server",
  "c#": "c#",
  csharp: "c#",
  "c++": "c++",
  cpp: "c++",
  golang: "go",
  py: "python",
  rb: "ruby",
  "ruby on rails": "rails",
  ror: "rails",
  "dotnet": ".net",
  "dot net": ".net",
  ".net core": ".net",
  "asp.net": "asp.net",
  ml: "machine learning",
  "m.l.": "machine learning",
  ai: "artificial intelligence",
  nlp: "natural language processing",
  llm: "large language models",
  llmops: "mlops",
  devops: "devops",
  sre: "site reliability engineering",
  "full stack": "full-stack",
  fullstack: "full-stack",
  "front end": "frontend",
  "front-end": "frontend",
  "back end": "backend",
  "back-end": "backend",
  ui: "ui/ux",
  ux: "ui/ux",
  "ui/ux": "ui/ux",
  "power bi": "power bi",
  powerbi: "power bi",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "ms office": "microsoft office",
  "office 365": "microsoft 365",
  o365: "microsoft 365",
  "rest api": "rest",
  restful: "rest",
  graphql: "graphql",
  gql: "graphql",
  terraform: "terraform",
  tf: "terraform",
  docker: "docker",
  containers: "docker",
  scrum: "agile",
  kanban: "agile",
  jira: "jira",
  figma: "figma",
  sketch: "figma",
  tableau: "tableau",
  snowflake: "snowflake",
  databricks: "databricks",
  spark: "apache spark",
  kafka: "apache kafka",
  redis: "redis",
  elasticsearch: "elasticsearch",
  elastic: "elasticsearch",
  "es6": "javascript",
  "es2015": "javascript",
  html5: "html",
  css3: "css",
  sass: "scss",
  "tailwind css": "tailwind",
  tailwindcss: "tailwind",
  "amazon web services": "amazon web services",
  "google cloud": "google cloud",
  "microsoft azure": "microsoft azure",

  // Finance / accounting / implementation stack
  qbo: "quickbooks",
  "quickbooks online": "quickbooks",
  "quick books": "quickbooks",
  "quick books online": "quickbooks",
  "quickbooks desktop": "quickbooks",
  intuit: "quickbooks",
  "bill.com": "bill.com",
  billcom: "bill.com",
  "bill com": "bill.com",
  "divvy": "ramp",
  expensify: "expense management",
  "corporate cards": "expense management",
  "expense management": "expense management",
  "accounts payable": "accounts payable",
  "a/p": "accounts payable",
  ap: "accounts payable",
  "ap automation": "accounts payable",
  "accounts receivable": "accounts receivable",
  "a/r": "accounts receivable",
  ar: "accounts receivable",
  "general ledger": "general ledger",
  gl: "general ledger",
  "chart of accounts": "chart of accounts",
  coa: "chart of accounts",
  "fund accounting": "fund accounting",
  "fund-based accounting": "fund accounting",
  "month end close": "month-end close",
  "month-end": "month-end close",
  "month end": "month-end close",
  "year end close": "year-end close",
  "year-end": "year-end close",
  "bank feeds": "bank reconciliation",
  "bank recon": "bank reconciliation",
  "bank reconciliations": "bank reconciliation",
  reconciliations: "bank reconciliation",
  reconciliation: "bank reconciliation",
  "journal entries": "journal entries",
  "journal entry": "journal entries",
  "financial reporting": "financial reporting",
  "financial reports": "financial reporting",
  "financial statements": "financial reporting",
  "donor management": "donor management",
  "donation management": "donor management",
  "donor statements": "donor management",
  "planning center": "planning center",
  "planning center giving": "planning center",
  bloomerang: "bloomerang",
  givebutter: "givebutter",
  "give butter": "givebutter",
  gusto: "gusto",
  "google workspace": "google workspace",
  "g suite": "google workspace",
  gsuite: "google workspace",
  "google docs": "google workspace",
  "google sheets": "google workspace",
  "google drive": "google workspace",
  "data migration": "data migration",
  "system implementation": "implementation",
  implementation: "implementation",
  "implementations": "implementation",
  onboarding: "client onboarding",
  "client onboarding": "client onboarding",
  "client facing": "client-facing",
  "client-facing": "client-facing",
  "customer facing": "client-facing",
  bookkeeping: "bookkeeping",
  bookkeeper: "bookkeeping",
  accounting: "accounting",
  accountant: "accounting",
  finance: "finance",
  "nonprofit": "nonprofit",
  "non-profit": "nonprofit",
  "not for profit": "nonprofit",
  "not-for-profit": "nonprofit",
  ministry: "nonprofit",
  church: "nonprofit",
  "faith-based": "nonprofit",
  "faith based": "nonprofit",
  "audit readiness": "audit",
  auditing: "audit",
  "1099": "1099s",
  "1099s": "1099s",
  "accounts payable workflows": "accounts payable",
  "ap workflows": "accounts payable",
  "ap/ar": "accounts payable",
  "a/p a/r": "accounts payable",
  "financial systems": "financial systems",
  "financial technology": "financial systems",
  "fintech stack": "financial systems",
  "netsuite": "netsuite",
  xero: "xero",
  sage: "sage",
  "sage intacct": "sage",
};

/**
 * Related skill groups — near-matches count (not just exact strings).
 * Keys and values should be canonical (post-alias) forms.
 */
const RELATED_SKILL_GROUPS: string[][] = [
  [
    "quickbooks",
    "accounting",
    "finance",
    "bookkeeping",
    "general ledger",
    "chart of accounts",
    "financial systems",
    "financial reporting",
    "xero",
    "sage",
    "netsuite",
  ],
  [
    "accounts payable",
    "bill.com",
    "accounts receivable",
    "expense management",
    "ramp",
    "bank reconciliation",
    "journal entries",
    "month-end close",
    "year-end close",
  ],
  [
    "fund accounting",
    "nonprofit",
    "donor management",
    "planning center",
    "bloomerang",
    "givebutter",
  ],
  ["implementation", "client onboarding", "data migration", "training"],
  ["client-facing", "client onboarding", "training", "account management"],
  ["project management", "implementation", "client onboarding"],
  ["budgeting", "forecasting", "financial reporting", "audit", "1099s"],
  ["google workspace", "microsoft office", "microsoft 365", "excel"],
  ["gusto", "payroll", "hris"],
];

const RELATED_LOOKUP: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const group of RELATED_SKILL_GROUPS) {
    const set = new Set(group.map(normalizeSkillLoose));
    for (const s of set) {
      const existing = m.get(s) || new Set<string>();
      for (const o of set) existing.add(o);
      m.set(s, existing);
    }
  }
  return m;
})();

/** Loose normalize used only while building related lookup (before full normalizeSkill exists). */
function normalizeSkillLoose(s: string): string {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, " ")
    .replace(/[^\w+#./\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Multi-word and single-token tech / soft skills for extraction */
const COMMON_SKILLS: string[] = [
  // Languages
  "javascript",
  "typescript",
  "python",
  "java",
  "c#",
  "c++",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  "matlab",
  "sql",
  "html",
  "css",
  "scss",
  // Frameworks / libs
  "react",
  "react native",
  "angular",
  "vue",
  "next.js",
  "node.js",
  "express",
  "django",
  "flask",
  "fastapi",
  "spring",
  "spring boot",
  ".net",
  "asp.net",
  "rails",
  "laravel",
  "svelte",
  "redux",
  "graphql",
  "rest",
  "tailwind",
  // Cloud / infra
  "amazon web services",
  "aws",
  "microsoft azure",
  "google cloud",
  "kubernetes",
  "docker",
  "terraform",
  "ansible",
  "jenkins",
  "ci/cd",
  "github actions",
  "gitlab",
  "linux",
  "unix",
  "bash",
  "powershell",
  "devops",
  "site reliability engineering",
  "mlops",
  // Data
  "postgresql",
  "mysql",
  "mongodb",
  "sql server",
  "redis",
  "elasticsearch",
  "apache kafka",
  "apache spark",
  "snowflake",
  "databricks",
  "tableau",
  "power bi",
  "excel",
  "etl",
  "data warehouse",
  "machine learning",
  "artificial intelligence",
  "natural language processing",
  "large language models",
  "deep learning",
  "pandas",
  "numpy",
  "pytorch",
  "tensorflow",
  // Soft / business
  "leadership",
  "project management",
  "product management",
  "agile",
  "scrum",
  "communication",
  "stakeholder management",
  "problem solving",
  "team building",
  "mentoring",
  "sales",
  "business development",
  "account management",
  "customer success",
  "recruiting",
  "sourcing",
  "negotiation",
  "presentation",
  "strategic planning",
  "budgeting",
  "forecasting",
  "training",
  "payroll",
  // Finance / accounting / nonprofit implementation
  "quickbooks",
  "bill.com",
  "ramp",
  "accounts payable",
  "accounts receivable",
  "general ledger",
  "chart of accounts",
  "fund accounting",
  "month-end close",
  "year-end close",
  "bank reconciliation",
  "journal entries",
  "financial reporting",
  "donor management",
  "planning center",
  "bloomerang",
  "givebutter",
  "gusto",
  "google workspace",
  "data migration",
  "implementation",
  "client onboarding",
  "client-facing",
  "bookkeeping",
  "accounting",
  "finance",
  "nonprofit",
  "audit",
  "1099s",
  "financial systems",
  "netsuite",
  "xero",
  "sage",
  "expense management",
  // Roles / domains often used as skill signals
  "full-stack",
  "frontend",
  "backend",
  "ui/ux",
  "cybersecurity",
  "security",
  "compliance",
  "hipaa",
  "sox",
  "gdpr",
  "saas",
  "b2b",
  "b2c",
  "fintech",
  "healthcare",
  "erp",
  "crm",
  "salesforce",
  "hubspot",
  "workday",
  "sap",
  "oracle",
  "figma",
  "jira",
  "confluence",
  "microsoft office",
  "microsoft 365",
  "powerpoint",
  "word",
];

// Longer phrases first for extraction
const SKILLS_BY_LENGTH = [...COMMON_SKILLS].sort((a, b) => b.length - a.length);

const SENIORITY_KEYWORDS: Array<{ pattern: RegExp; level: number; label: string }> = [
  { pattern: /\b(intern|internship|student|entry[-\s]?level|junior|jr\.?)\b/i, level: 1, label: "junior" },
  { pattern: /\b(mid[-\s]?level|intermediate)\b/i, level: 2, label: "mid" },
  { pattern: /\b(senior|sr\.?)\b/i, level: 3, label: "senior" },
  // Avoid matching:
  // - verbs like "Lead financial discovery"
  // - "staff accountant" (common IC title, not staff-level eng ladder)
  {
    pattern:
      /\b(principal|architect)\b|\b(staff\s+(engineer|developer|scientist|designer|product))\b|\b(team\s+lead|tech\s+lead|technical\s+lead|lead\s+(engineer|developer|accountant|analyst|consultant|manager|recruiter|designer))\b/i,
    level: 4,
    label: "lead",
  },
  { pattern: /\b(director|vp|vice president|head of|chief|c[to]o)\b/i, level: 5, label: "executive" },
];

/**
 * Normalize a skill string: trim, lowercase, apply alias map.
 */
export function normalizeSkill(s: string): string {
  if (!s || typeof s !== "string") return "";
  let t = s
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, " ")
    .replace(/[^\w+#./\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (SKILL_ALIASES[t]) return SKILL_ALIASES[t];
  // Try without dots for things like react.js already handled; strip trailing dots
  const noDot = t.replace(/\.$/, "");
  if (SKILL_ALIASES[noDot]) return SKILL_ALIASES[noDot];
  // Collapse common "online/desktop" product suffixes after alias miss
  const stripped = t
    .replace(/\b(online|desktop|cloud|software|system|platform|suite)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && SKILL_ALIASES[stripped]) return SKILL_ALIASES[stripped];
  if (stripped && stripped !== t) return stripped;
  return t;
}

/**
 * Extract skills from free text using known skill lists + multi-word phrases.
 */
export function extractSkillsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const skill of SKILLS_BY_LENGTH) {
    const needle = skill.toLowerCase();
    // Word-boundary-ish match (allow . # + / -)
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`,
      "i"
    );
    if (re.test(lower)) {
      found.add(normalizeSkill(skill));
    }
  }

  return Array.from(found).filter(Boolean);
}

const STOP_SKILL_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "role",
  "of",
  "to",
  "in",
  "a",
  "an",
  "or",
  "on",
  "at",
  "by",
]);

function skillTokens(skill: string): string[] {
  return normalizeSkill(skill)
    .split(/[\s,/|+.()-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_SKILL_TOKENS.has(t));
}

/**
 * Soft skill match: exact, related-group, substring, or token overlap.
 * Returns 0–1 credit so near-matches count (user expectation).
 */
export function skillMatchCredit(
  jobSkill: string,
  candidateSkills: string[]
): { credit: number; matchedAs?: string } {
  const job = normalizeSkill(jobSkill);
  if (!job) return { credit: 0 };
  const candNorm = candidateSkills.map(normalizeSkill).filter(Boolean);

  // Exact
  if (candNorm.includes(job)) return { credit: 1, matchedAs: job };

  // Related skill family (e.g. QuickBooks ≈ accounting/bookkeeping)
  const related = RELATED_LOOKUP.get(job);
  if (related) {
    for (const c of candNorm) {
      if (related.has(c)) {
        return { credit: 0.85, matchedAs: c };
      }
    }
  }

  // Substring / containment (quickbooks vs quickbooks online already aliased;
  // still helps custom free-text skills)
  for (const c of candNorm) {
    if (!c) continue;
    if (c.includes(job) || job.includes(c)) {
      // Avoid tiny false positives ("r" in "react")
      if (Math.min(c.length, job.length) >= 4) {
        return { credit: 0.8, matchedAs: c };
      }
    }
  }

  // Significant token overlap
  const jobToks = skillTokens(job);
  if (jobToks.length > 0) {
    let best = 0;
    let bestC = "";
    for (const c of candNorm) {
      const cToks = new Set(skillTokens(c));
      if (cToks.size === 0) continue;
      const hits = jobToks.filter((t) => cToks.has(t)).length;
      const ratio = hits / jobToks.length;
      if (ratio > best) {
        best = ratio;
        bestC = c;
      }
    }
    if (best >= 0.5) {
      return { credit: 0.55 + best * 0.35, matchedAs: bestC };
    }
  }

  return { credit: 0 };
}

/**
 * Domain keyword soft overlap — catches JD language that isn't in skill lists
 * (e.g. "ministry clients", "month-end close") when present in candidate blob.
 */
const DOMAIN_KEYWORDS: string[] = [
  "accounting",
  "accountant",
  "finance",
  "financial",
  "bookkeep",
  "quickbooks",
  "qbo",
  "accounts payable",
  "accounts receivable",
  "a/p",
  "a/r",
  "ap/ar",
  "ap & ar",
  "reconciliation",
  "reconciliations",
  "journal entr",
  "general ledger",
  "chart of accounts",
  "fund accounting",
  "month-end",
  "month end",
  "year-end",
  "year end",
  "1099",
  "audit",
  "budget",
  "forecast",
  "nonprofit",
  "non-profit",
  "ministry",
  "church",
  "donor",
  "donation",
  "implementation",
  "onboarding",
  "data migration",
  "client-facing",
  "client facing",
  "training",
  "bill.com",
  "ramp",
  "bloomerang",
  "planning center",
  "google workspace",
  "g suite",
  "financial reporting",
  "financial statements",
];

function domainKeywordOverlap(candText: string, jobText: string): {
  score: number; // 0-1
  hits: string[];
} {
  const c = (candText || "").toLowerCase();
  const j = (jobText || "").toLowerCase();
  if (!c.trim() || !j.trim()) return { score: 0, hits: [] };

  const jobKeywords = DOMAIN_KEYWORDS.filter((k) => j.includes(k));
  if (jobKeywords.length === 0) return { score: 0, hits: [] };

  const hits = jobKeywords.filter((k) => c.includes(k));
  // Deduplicate near-duplicates (month-end / month end)
  const uniqHits = Array.from(new Set(hits.map((h) => h.replace(/\s+/g, " "))));
  const ratio = uniqHits.length / jobKeywords.length;
  // Soft curve — a handful of strong domain hits should move the needle
  const score = Math.min(1, ratio * 1.15);
  return { score, hits: uniqHits.slice(0, 12) };
}

function gradeFromScore(score: number): FitGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function normalizeLocation(loc?: string): string {
  if (!loc) return "";
  return loc
    .toLowerCase()
    .replace(/,?\s*(usa|u\.s\.a\.|united states|us)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const US_STATE_NAMES: Record<string, string> = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
  "district of columbia": "dc",
  "washington dc": "dc",
  "washington d.c.": "dc",
};

function extractStateCodes(loc: string): string[] {
  if (!loc) return [];
  const codes = new Set<string>();
  const valid = new Set(Object.values(US_STATE_NAMES));
  const lower = loc.toLowerCase();

  // Full state names (safe — not short English words)
  for (const [name, code] of Object.entries(US_STATE_NAMES)) {
    if (name.length >= 5 && lower.includes(name)) codes.add(code);
  }
  // Short names that are unambiguous as places
  for (const name of ["ohio", "iowa", "utah", "texas"]) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
      codes.add(US_STATE_NAMES[name]);
    }
  }

  // Comma/space-separated 2-letter code lists (e.g. "CO, DC, FL, GA, … or VA")
  // Prefer "following states:" / dense code lists — avoid English words like "in"/"or".
  const listChunk =
    lower.match(/following\s+states?[:\s]+([a-z0-9,.\s/|orand-]{6,220})/i)?.[1] ||
    lower.match(
      /\b((?:[a-z]{2}\s*,\s*){3,}(?:[a-z]{2}\s*,\s*)*[a-z]{2}(?:\s*,?\s*or\s+[a-z]{2})?)\b/i
    )?.[1] ||
    "";
  if (listChunk) {
    const codeRe = /\b([a-z]{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(listChunk))) {
      const code = m[1].toLowerCase();
      if (valid.has(code)) codes.add(code);
    }
  }

  // Single "City, ST" pattern on candidate location
  const cityState = lower.match(/,\s*([a-z]{2})\s*$/);
  if (cityState && valid.has(cityState[1])) codes.add(cityState[1]);

  return Array.from(codes);
}

function locationSoftMatch(
  candidateLoc?: string,
  jobLoc?: string,
  jobDescription?: string
): {
  score: number; // 0-1
  reason?: string;
} {
  const c = normalizeLocation(candidateLoc);
  const j = normalizeLocation(jobLoc);
  const jobLocBlob = [j, jobDescription || ""].filter(Boolean).join(" ");

  if (!j && !jobDescription) return { score: 0.5 }; // neutral when job has no location
  if (!c) return { score: 0.35, reason: "Candidate location unknown" };

  if (j && c === j) return { score: 1, reason: "Location exact match" };

  // Remote flexibility
  const jobRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(jobLocBlob);
  const candRemote = /\bremote\b|\bopen to remote\b/i.test(c);
  if (jobRemote || candRemote) {
    return { score: 0.85, reason: "Remote / flexible location" };
  }

  // Multi-state eligibility lists (common in distributed / remote-US JDs)
  const jobStates = extractStateCodes(jobLocBlob);
  const candStates = extractStateCodes(c);
  if (jobStates.length >= 2 && candStates.length > 0) {
    const hit = candStates.find((s) => jobStates.includes(s));
    if (hit) {
      return {
        score: 0.95,
        reason: `Candidate state (${hit.toUpperCase()}) is in job's eligible states`,
      };
    }
    return {
      score: 0.25,
      reason: "Candidate state not in job's eligible state list",
    };
  }
  if (jobStates.length === 1 && candStates.length > 0) {
    if (candStates.includes(jobStates[0])) {
      return {
        score: 0.95,
        reason: `Location state match (${jobStates[0].toUpperCase()})`,
      };
    }
  }

  // City or state substring against job location field / description
  if (j) {
    const cParts = c.split(/[,\s/]+/).filter((p) => p.length > 2);
    const jParts = j.split(/[,\s/]+/).filter((p) => p.length > 2);
    const overlap = cParts.filter((p) => jParts.includes(p) || j.includes(p));
    if (overlap.length > 0) {
      return { score: 0.75, reason: `Location partial match (${overlap[0]})` };
    }
  }

  // If we only had description states and no candidate match, already returned above
  if (jobStates.length === 0) {
    return { score: 0.5, reason: "Job location not specific enough to score" };
  }

  return { score: 0.2, reason: "Location mismatch" };
}

function detectSeniority(text: string): { level: number; label: string } {
  for (const row of [...SENIORITY_KEYWORDS].sort((a, b) => b.level - a.level)) {
    if (row.pattern.test(text)) return { level: row.level, label: row.label };
  }
  return { level: 2, label: "mid" }; // default mid when unspecified
}

/**
 * Estimate years of experience from experience array date strings.
 * Heuristic only — parses years like "2018-2022", "2019 – Present".
 */
function estimateYearsFromExperience(
  experience?: FitCandidateInput["experience"]
): number {
  if (!Array.isArray(experience) || experience.length === 0) return 0;
  let totalMonths = 0;
  const now = new Date();

  for (const exp of experience) {
    const dates = String(exp?.dates || "");
    const years = dates.match(/(19|20)\d{2}/g);
    if (!years || years.length === 0) {
      // Assume ~2 years per role without dates
      totalMonths += 24;
      continue;
    }
    const start = parseInt(years[0], 10);
    const endStr = years[years.length - 1];
    const isPresent = /present|current|now/i.test(dates);
    const end = isPresent || years.length === 1 ? now.getFullYear() : parseInt(endStr, 10);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      totalMonths += (end - start) * 12 + 6; // mid-year approx
    } else {
      totalMonths += 18;
    }
  }

  // Cap double-counting from overlapping roles
  const years = totalMonths / 12;
  return Math.min(30, Math.round(years * 10) / 10);
}

/** Expand role titles so "Accountant" can match "Finance Implementation Specialist". */
const TITLE_SYNONYMS: Record<string, string[]> = {
  finance: [
    "accounting",
    "accountant",
    "bookkeeper",
    "bookkeeping",
    "controller",
    "financial",
    "fp&a",
    "treasury",
  ],
  financial: ["finance", "accounting", "accountant", "controller"],
  accounting: ["accountant", "finance", "financial", "bookkeeper", "bookkeeping"],
  accountant: ["accounting", "finance", "financial", "bookkeeper"],
  implementation: [
    "implement",
    "onboarding",
    "configuration",
    "configure",
    "deployment",
    "rollout",
    "systems",
    "consultant",
    "consulting",
  ],
  specialist: ["analyst", "consultant", "associate", "coordinator", "lead"],
  analyst: ["specialist", "consultant", "associate"],
  consultant: ["specialist", "implementation", "advisor"],
  bookkeeper: ["bookkeeping", "accounting", "accountant", "quickbooks"],
  bookkeeping: ["bookkeeper", "accounting", "accountant"],
  controller: ["accounting", "finance", "financial"],
  nonprofit: ["non-profit", "ministry", "church", "faith", "donor"],
  ministry: ["church", "nonprofit", "faith", "religious"],
};

function titleKeywordScore(
  candidateTitle: string,
  jobTitle: string,
  candidateSummary: string
): { score: number; reasons: string[]; strengths: string[]; gaps: string[] } {
  const reasons: string[] = [];
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (!jobTitle.trim()) {
    return { score: 0.5, reasons, strengths, gaps };
  }

  const jobTokens = jobTitle
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "with", "role"].includes(t));

  const candBlob = `${candidateTitle} ${candidateSummary}`.toLowerCase();
  if (jobTokens.length === 0) {
    return { score: 0.5, reasons, strengths, gaps };
  }

  let hits = 0;
  const matched: string[] = [];
  for (const t of jobTokens) {
    if (candBlob.includes(t)) {
      hits += 1;
      matched.push(t);
      continue;
    }
    // Synonym near-match (finance ↔ accounting, implementation ↔ onboarding)
    const syns = TITLE_SYNONYMS[t] || [];
    if (syns.some((s) => candBlob.includes(s))) {
      hits += 0.75;
      matched.push(`~${t}`);
    }
  }
  const ratio = hits / jobTokens.length;

  if (ratio >= 0.6) {
    strengths.push(`Title/role alignment: ${matched.slice(0, 4).join(", ")}`);
    reasons.push("Strong title/role keyword overlap");
  } else if (ratio >= 0.3) {
    reasons.push("Partial title/role keyword overlap (including related terms)");
  } else {
    gaps.push(`Limited title match vs "${jobTitle}"`);
    reasons.push("Weak title/role keyword overlap");
  }

  return { score: Math.min(1, ratio + (ratio > 0 ? 0.1 : 0)), reasons, strengths, gaps };
}

/**
 * Score candidate fitness for a job.
 * Weights: skills 60%, title/role 20%, location 10%, seniority/years 10%.
 */
export function scoreCandidateJobFit(
  candidate: FitCandidateInput,
  job: FitJobInput
): FitScoreResult {
  const jobText = [job.title, job.description, job.salaryRange]
    .filter(Boolean)
    .join("\n");
  const candText = [
    candidate.title,
    candidate.summary,
    ...(candidate.skills || []),
    ...(candidate.experience || []).flatMap((e) =>
      [e.title, e.company, e.description].filter(Boolean)
    ),
  ]
    .filter(Boolean)
    .join("\n");

  // --- Skills (50%) + domain soft-match (10%) ---
  // Skills weight reduced slightly so domain keyword near-matches can contribute.
  const explicitSkills = (candidate.skills || [])
    .map(normalizeSkill)
    .filter(Boolean);
  const extractedCand = extractSkillsFromText(candText);
  const candidateSkills = Array.from(
    new Set([...explicitSkills, ...extractedCand])
  );

  const jobSkills = extractSkillsFromText(jobText);
  // If job has no extractable skills, fall back to title tokens as soft skills
  const effectiveJobSkills =
    jobSkills.length > 0
      ? jobSkills
      : (job.title || "")
          .toLowerCase()
          .split(/[\s,/|]+/)
          .map(normalizeSkill)
          .filter((s) => s.length > 2);

  const skillsMatched: string[] = [];
  const skillsMissing: string[] = [];
  let creditSum = 0;
  for (const js of effectiveJobSkills) {
    const { credit, matchedAs } = skillMatchCredit(js, candidateSkills);
    if (credit >= 0.5) {
      creditSum += credit;
      skillsMatched.push(
        credit >= 0.99 ? js : `${js}≈${matchedAs || "related"}`
      );
    } else {
      skillsMissing.push(js);
    }
  }

  let skillsRatio = 0;
  if (effectiveJobSkills.length === 0) {
    skillsRatio = candidateSkills.length > 0 ? 0.55 : 0.4;
  } else {
    skillsRatio = creditSum / effectiveJobSkills.length;
    // Bonus for having extra relevant depth (capped)
    if (candidateSkills.length >= effectiveJobSkills.length && skillsRatio > 0) {
      skillsRatio = Math.min(1, skillsRatio + 0.05);
    }
  }

  // Domain keyword soft score (near-match language not limited to skill list)
  const domain = domainKeywordOverlap(candText, jobText);
  // Blend: structured skills still dominate, domain rescues true-fit profiles
  // that the closed skill list under-extracts.
  const blendedSkills = Math.min(
    1,
    skillsRatio * 0.75 + domain.score * 0.35 + (skillsRatio > 0.3 ? 0.05 : 0)
  );

  // --- Title (20%) ---
  const titlePart = titleKeywordScore(
    candidate.title || "",
    job.title || "",
    // Include full candidate blob so experience language helps title synonyms
    candText
  );

  // --- Location (10%) ---
  const locPart = locationSoftMatch(
    candidate.location,
    job.location,
    job.description
  );

  // --- Seniority / years (10%) ---
  // Prefer job TITLE for seniority — full JD bullets often start with "Lead …" verbs
  // and incorrectly inflate seniority (e.g. "Lead financial discovery").
  const jobSen = detectSeniority(
    job.title?.trim()
      ? job.title
      : `${job.title || ""} ${job.description || ""}`
  );
  const candSen = detectSeniority(
    candidate.title?.trim()
      ? `${candidate.title} ${candidate.summary || ""}`
      : `${candidate.title || ""} ${candidate.summary || ""} ${candText}`
  );
  const years = estimateYearsFromExperience(candidate.experience);

  // Map years loosely onto seniority levels
  let yearsLevel = 1;
  if (years >= 12) yearsLevel = 5;
  else if (years >= 8) yearsLevel = 4;
  else if (years >= 5) yearsLevel = 3;
  else if (years >= 2) yearsLevel = 2;

  const effectiveCandLevel = Math.max(candSen.level, yearsLevel);
  const levelDiff = Math.abs(effectiveCandLevel - jobSen.level);
  let seniorityScore = 1;
  if (levelDiff === 0) seniorityScore = 1;
  else if (levelDiff === 1) seniorityScore = 0.75;
  // Over-qualified by 2 levels is still fine for IC specialist roles
  else if (levelDiff === 2) seniorityScore = 0.55;
  else seniorityScore = 0.3;

  // Slight boost if years look solid and job is senior+
  if (jobSen.level >= 3 && years >= 5) {
    seniorityScore = Math.min(1, seniorityScore + 0.1);
  }
  // Don't punish experienced accountants for "mid" specialist JDs
  if (effectiveCandLevel > jobSen.level && years >= 4) {
    seniorityScore = Math.max(seniorityScore, 0.7);
  }

  const weighted =
    blendedSkills * 0.6 +
    titlePart.score * 0.2 +
    locPart.score * 0.1 +
    seniorityScore * 0.1;

  const score = Math.max(0, Math.min(100, Math.round(weighted * 100)));
  const grade = gradeFromScore(score);

  const reasons: string[] = [];
  const strengths: string[] = [...titlePart.strengths];
  const gaps: string[] = [...titlePart.gaps];

  if (skillsMatched.length > 0) {
    strengths.push(
      `Matched skills: ${skillsMatched.slice(0, 8).join(", ")}${
        skillsMatched.length > 8 ? "…" : ""
      }`
    );
    reasons.push(
      `${skillsMatched.length}/${effectiveJobSkills.length || "?"} skills matched (incl. near-matches)`
    );
  } else if (effectiveJobSkills.length > 0 && domain.hits.length === 0) {
    reasons.push("No required skills matched from job description");
  }

  if (domain.hits.length > 0) {
    strengths.push(
      `Domain language overlap: ${domain.hits.slice(0, 6).join(", ")}`
    );
    reasons.push(
      `Domain keyword overlap ${Math.round(domain.score * 100)}% (${domain.hits.length} terms)`
    );
  }

  if (skillsMissing.length > 0) {
    gaps.push(
      `Weaker / missing skills: ${skillsMissing.slice(0, 6).join(", ")}${
        skillsMissing.length > 6 ? "…" : ""
      }`
    );
  }

  if (locPart.reason) {
    if (locPart.score >= 0.7) strengths.push(locPart.reason);
    else if (locPart.score < 0.4) gaps.push(locPart.reason);
    reasons.push(locPart.reason);
  }

  if (years > 0) {
    reasons.push(`~${years} yrs experience (heuristic)`);
    if (years >= 5) strengths.push(`Solid tenure (~${years} years)`);
  }

  reasons.push(
    `Seniority signal: candidate ${candSen.label} vs job ${jobSen.label}`
  );
  if (levelDiff >= 2) {
    gaps.push(`Seniority gap (candidate ${candSen.label}, job ${jobSen.label})`);
  } else if (levelDiff === 0) {
    strengths.push(`Seniority aligned (${jobSen.label})`);
  }

  reasons.push(...titlePart.reasons);

  // Dedupe reasons
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

  return {
    score,
    grade,
    reasons: uniq(reasons).slice(0, 12),
    strengths: uniq(strengths).slice(0, 10),
    gaps: uniq(gaps).slice(0, 10),
    skillsMatched: uniq(skillsMatched),
    skillsMissing: uniq(skillsMissing),
  };
}

/**
 * Format a short human-readable fit summary (for notes / API).
 */
export function formatFitSummary(result: FitScoreResult): string {
  const lines = [
    `Fit score: ${result.score}/100 (grade ${result.grade})`,
    result.strengths.length
      ? `Strengths: ${result.strengths.slice(0, 3).join("; ")}`
      : "",
    result.gaps.length ? `Gaps: ${result.gaps.slice(0, 3).join("; ")}` : "",
    result.skillsMatched.length
      ? `Skills matched: ${result.skillsMatched.slice(0, 8).join(", ")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}
