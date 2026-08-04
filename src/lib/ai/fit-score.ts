/**
 * Deterministic + light-heuristic candidate↔job fit scorer.
 * No Bedrock/LLM required for base score (optional polish later).
 *
 * Pure functions — no DynamoDB / server deps.
 */

export type FitGrade = "A" | "B" | "C" | "D" | "F";

/** One half of the split fit view (domain vs tools). */
export interface FitSplitScore {
  score: number; // 0-100
  grade: FitGrade;
  /** False when the JD has no tool/product skills to score. */
  applicable?: boolean;
}

/** Canonical multi-factor fit dimensions (deterministic heuristics). */
export type FitDimensionId =
  | "skills_match"
  | "years_experience"
  | "industry_domain"
  | "seniority_scope"
  | "achievements"
  | "responsibilities"
  | "education_credentials"
  | "career_trajectory"
  | "location_arrangement"
  | "keyword_context";

export interface FitDimensionScore {
  id: FitDimensionId;
  label: string;
  score: number; // 0-100
  grade: FitGrade;
  /** Short recruiter-facing note */
  detail: string;
  /** When false, excluded from overall average */
  applicable: boolean;
}

export interface FitScoreResult {
  /** Overall = average of applicable dimensions. */
  score: number; // 0-100
  grade: FitGrade;
  /** Domain / role fit rollup (for compact badges). */
  domainFit: FitSplitScore;
  /** Tool / product readiness (for compact badges). */
  toolReadiness: FitSplitScore;
  /** Full multi-factor breakdown */
  dimensions: FitDimensionScore[];
  /** Skills match: exact vs adjacent (transferable) counts */
  skillsExactCount?: number;
  skillsAdjacentCount?: number;
  reasons: string[];
  strengths: string[];
  gaps: string[];
  skillsMatched: string[];
  skillsMissing: string[];
  toolsMatched: string[];
  toolsMissing: string[];
}

export interface FitReviewAssessment {
  score: number;
  grade: FitGrade;
  domainFit: FitSplitScore;
  toolReadiness: FitSplitScore;
  dimensions: FitDimensionScore[];
  headline: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  matchedSkills: string[];
  missingSkills: string[];
  toolsMatched: string[];
  toolsMissing: string[];
  confidence: "high" | "medium" | "low";
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
/**
 * Tight related groups only — near-matches must be genuinely interchangeable.
 * (Broad groups caused noise like month-end≈AP and unreadable ≈ labels.)
 */
const RELATED_SKILL_GROUPS: string[][] = [
  ["quickbooks", "xero", "sage", "netsuite", "financial systems"],
  ["accounting", "finance", "bookkeeping"],
  ["general ledger", "chart of accounts", "journal entries"],
  ["accounts payable", "bill.com"],
  ["accounts receivable"],
  ["expense management", "ramp", "expensify"],
  ["bank reconciliation", "month-end close", "year-end close"],
  ["financial reporting", "budgeting", "forecasting"],
  ["fund accounting", "nonprofit"],
  ["donor management", "planning center", "bloomerang", "givebutter"],
  ["implementation", "client onboarding", "data migration"],
  ["client-facing", "training", "account management", "customer success"],
  ["project management", "implementation"],
  ["audit", "1099s"],
  ["google workspace", "microsoft office", "microsoft 365", "excel"],
  ["gusto", "payroll"],
];

/** Skills often present because the *agency* name is in the JD, not a requirement */
const AGENCY_NOISE_SKILLS = new Set(["recruiting", "sourcing"]);

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
  // Require clear exec *title* forms — avoid "head of household", random "chief", etc.
  {
    pattern:
      /\b(director|vp|vice president|head of (finance|accounting|operations|engineering|product|sales|people|hr)|chief (financial|executive|operating|technology|people) officer|cfo|ceo|coo|cto|cpo)\b/i,
    level: 5,
    label: "executive",
  },
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

/** Extra free-text phrases that prove a canonical skill is present on a resume */
const SKILL_TEXT_HINTS: Record<string, string[]> = {
  "month-end close": [
    "month-end",
    "month end",
    "month end close",
    "monthly close",
    "close process",
    "period close",
  ],
  "journal entries": [
    "journal entr",
    "journal entry",
    "journal entries",
    "gl entries",
  ],
  "general ledger": [
    "general ledger",
    " g/l ",
    " g.l.",
    "gl accounting",
    "full-cycle accounting",
    "full cycle accounting",
  ],
  "chart of accounts": ["chart of accounts", "coa ", "account structure"],
  "bank reconciliation": [
    "bank reconcil",
    "reconciliations",
    "reconciliation",
    "bank feeds",
  ],
  "accounts payable": ["accounts payable", "a/p", " ap ", "ap/", "payables"],
  "accounts receivable": ["accounts receivable", "a/r", " ar ", "ar/", "receivables"],
  "client-facing": [
    "client-facing",
    "client facing",
    "customer facing",
    "client training",
    "trained clients",
    "client onboarding",
    "stakeholder",
    "worked with clients",
    "customer success",
  ],
  "financial reporting": [
    "financial report",
    "financial statements",
    "p&l",
    "balance sheet",
    "management reporting",
  ],
  implementation: [
    "implementation",
    "implemented",
    "system implementation",
    "rollout",
    "deployed",
  ],
  "data migration": ["data migration", "migrat", "data conversion"],
  quickbooks: ["quickbooks", "qbo", "quick books"],
  "fund accounting": ["fund accounting", "fund-based", "restricted funds"],
  "donor management": ["donor", "donation management", "giving platform"],
};

/**
 * Soft skill match: exact, related-group, free-text hints, substring, or tokens.
 * Returns 0–1 credit so near-matches count (user expectation).
 */
export function skillMatchCredit(
  jobSkill: string,
  candidateSkills: string[],
  candidateText?: string
): { credit: number; matchedAs?: string } {
  const job = normalizeSkill(jobSkill);
  if (!job) return { credit: 0 };
  const candNorm = candidateSkills.map(normalizeSkill).filter(Boolean);
  const blob = (candidateText || "").toLowerCase();

  // Exact
  if (candNorm.includes(job)) return { credit: 1, matchedAs: job };

  // Related skill family (tight groups only)
  const related = RELATED_LOOKUP.get(job);
  if (related) {
    for (const c of candNorm) {
      if (related.has(c)) {
        return { credit: 0.88, matchedAs: c };
      }
    }
  }

  // Free-text / resume language (catches "month end", "JEs", "client training")
  if (blob.length > 20) {
    if (blob.includes(job)) {
      return { credit: 0.95, matchedAs: job };
    }
    const hints = SKILL_TEXT_HINTS[job] || [];
    for (const hint of hints) {
      if (hint.length >= 3 && blob.includes(hint.toLowerCase())) {
        return { credit: 0.9, matchedAs: hint.trim() };
      }
    }
    // Also search related-family skills in free text
    if (related) {
      for (const rel of related) {
        if (rel !== job && blob.includes(rel)) {
          return { credit: 0.8, matchedAs: rel };
        }
        const relHints = SKILL_TEXT_HINTS[rel] || [];
        for (const hint of relHints) {
          if (hint.length >= 4 && blob.includes(hint.toLowerCase())) {
            return { credit: 0.78, matchedAs: hint.trim() };
          }
        }
      }
    }
  }

  // Substring / containment on structured skills
  for (const c of candNorm) {
    if (!c) continue;
    if (c.includes(job) || job.includes(c)) {
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

/** Core accounting ops that usually travel together on real finance resumes */
const ACCOUNTING_CLUSTER = [
  "accounting",
  "quickbooks",
  "general ledger",
  "chart of accounts",
  "journal entries",
  "month-end close",
  "bank reconciliation",
  "accounts payable",
  "accounts receivable",
  "financial reporting",
  "fund accounting",
  "bookkeeping",
];

/**
 * Domain / functional skills (not named products).
 * Everything else extracted from a JD is treated as a tool/product/process skill.
 */
const DOMAIN_SKILL_SET = new Set<string>([
  ...ACCOUNTING_CLUSTER,
  "finance",
  "accounting",
  "bookkeeping",
  "budgeting",
  "payroll",
  "tax",
  "audit",
  "nonprofit",
  "client-facing",
  "client onboarding",
  "customer service",
  "communication",
  "leadership",
  "management",
  "analysis",
  "reporting",
  "reconciliation",
]);

/** Known product / platform names (always tool readiness). */
const KNOWN_TOOL_SKILLS = new Set<string>([
  "planning center",
  "bloomerang",
  "salesforce",
  "hubspot",
  "workday",
  "netsuite",
  "sage",
  "xero",
  "bill.com",
  "intacct",
  "blackbaud",
  "raisers edge",
  "donorperfect",
  "little green light",
  "shelby",
  "acs",
  "church community builder",
  "pushpay",
  "tithely",
  "quickbooks online",
  "google workspace",
  "microsoft 365",
  "excel",
  "power bi",
  "tableau",
  "jira",
  "asana",
  "monday.com",
  "salesforce npsp",
]);

function isDomainSkill(skill: string): boolean {
  const n = normalizeSkill(skill);
  if (!n) return false;
  if (DOMAIN_SKILL_SET.has(n)) return true;
  if (KNOWN_TOOL_SKILLS.has(n)) return false;
  // Soft domain phrases
  if (
    /^(finance|accounting|bookkeep|budget|payroll|tax|audit|nonprofit|ministry)/.test(
      n
    )
  ) {
    return true;
  }
  return false;
}

function isToolSkill(skill: string): boolean {
  const n = normalizeSkill(skill);
  if (!n) return false;
  if (KNOWN_TOOL_SKILLS.has(n)) return true;
  if (isDomainSkill(n)) return false;
  // Implementation / project / product-ish terms from JDs
  if (
    /\b(implementation|migration|project management|donor management|crm|erp|saas|onboarding tool|data migration)\b/.test(
      n
    ) ||
    n.includes(".") ||
    n.endsWith(" software")
  ) {
    return true;
  }
  // Default: non-domain extracted skill → tool/product
  return true;
}

/** Prefer these skills first in "Core skills present" UI ordering */
const SKILL_DISPLAY_PRIORITY: string[] = [
  "quickbooks",
  "accounting",
  "finance",
  "general ledger",
  "chart of accounts",
  "accounts payable",
  "accounts receivable",
  "month-end close",
  "journal entries",
  "bank reconciliation",
  "fund accounting",
  "financial reporting",
  "budgeting",
  "implementation",
  "client-facing",
  "client onboarding",
  "data migration",
  "project management",
  "google workspace",
  "excel",
];

function sortSkillsForDisplay(skills: string[]): string[] {
  const rank = (s: string) => {
    const n = normalizeSkill(s);
    const idx = SKILL_DISPLAY_PRIORITY.indexOf(n);
    return idx >= 0 ? idx : 100 + n.charCodeAt(0);
  };
  return [...skills].sort((a, b) => rank(a) - rank(b));
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

  const jobRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(jobLocBlob);
  const candRemote = /\bremote\b|\bopen to remote\b/i.test(c);

  // Multi-state eligibility first — don't mislabel residency-list roles as plain "remote"
  const jobStates = extractStateCodes(jobLocBlob);
  const candStates = extractStateCodes(c);
  if (jobStates.length >= 2 && candStates.length > 0) {
    const hit = candStates.find((s) => jobStates.includes(s));
    if (hit) {
      return {
        score: 0.95,
        reason: jobRemote
          ? `Eligible state (${hit.toUpperCase()}) for this multi-state / remote role`
          : `Eligible state (${hit.toUpperCase()}) — matches job residency list`,
      };
    }
    return {
      score: 0.25,
      reason: "Candidate state not in job's eligible state list",
    };
  }
  if (jobStates.length >= 2 && candStates.length === 0) {
    return {
      score: 0.4,
      reason: "Confirm candidate lives in an eligible state for this role",
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

  if (jobRemote || candRemote) {
    return {
      score: 0.85,
      reason: jobRemote
        ? "Role allows remote / flexible location"
        : "Candidate open to remote",
    };
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

/** Parse "5+ years", "minimum of 3 years", "7-10 years" from JD text. */
function parseRequiredYears(jobText: string): number | null {
  const t = jobText.toLowerCase();
  const range = t.match(
    /(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*\+?\s*years?/
  );
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const m = t.match(
    /(?:minimum|at least|min\.?|require[sd]?|seeking)?[^\d]{0,20}(\d{1,2})\s*\+?\s*years?(?:\s+of)?(?:\s+(?:relevant|related|professional|experience))?/i
  );
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 40) return n;
  }
  return null;
}

/** Quantified achievement density (impact signals). */
function scoreAchievements(candText: string): {
  score: number;
  detail: string;
} {
  const t = candText || "";
  if (t.trim().length < 40) {
    return { score: 40, detail: "Too little resume text to judge achievements" };
  }
  const money = (t.match(/\$[\d,.]+|\d+(\.\d+)?\s*%/g) || []).length;
  const impact =
    t.match(
      /\b(increased|decreased|reduced|grew|saved|delivered|generated|improved|cut|raised|closed|hired|built|launched|scaled|won)\b/gi
    ) || [];
  const numbers = (t.match(/\b\d{2,}\b/g) || []).length;
  const hits = money + impact.length * 0.6 + Math.min(4, numbers * 0.15);
  const score = Math.max(25, Math.min(100, Math.round(35 + hits * 8)));
  const detail =
    money + impact.length > 0
      ? `Quantified / impact language found (${money} metric-like, ${impact.length} impact verbs)`
      : "Mostly responsibility language — few quantified results visible";
  return { score, detail };
}

/** Career trajectory: tenure stability + hop risk. */
function scoreCareerTrajectory(
  experience?: FitCandidateInput["experience"]
): { score: number; detail: string } {
  if (!Array.isArray(experience) || experience.length === 0) {
    return {
      score: 55,
      detail: "No structured experience history to judge trajectory",
    };
  }
  const roles = experience.length;
  const years = estimateYearsFromExperience(experience);
  const avgTenure = roles > 0 ? years / roles : years;
  let score = 70;
  let flags: string[] = [];
  if (avgTenure >= 2.5) {
    score += 15;
    flags.push(`~${avgTenure.toFixed(1)}y avg tenure`);
  } else if (avgTenure >= 1.5) {
    score += 5;
    flags.push(`~${avgTenure.toFixed(1)}y avg tenure`);
  } else if (roles >= 4 && years < 6) {
    score -= 20;
    flags.push("Possible job-hopping pattern");
  } else {
    score -= 8;
    flags.push("Shorter tenures");
  }
  // Progression: later titles senior-er than early
  if (roles >= 2) {
    const first = detectSeniority(String(experience[experience.length - 1]?.title || ""));
    const last = detectSeniority(String(experience[0]?.title || ""));
    if (last.level > first.level) {
      score += 10;
      flags.push("Upward progression");
    } else if (last.level < first.level) {
      score -= 5;
      flags.push("Title level not clearly progressing");
    }
  }
  score = Math.max(20, Math.min(100, Math.round(score)));
  return { score, detail: flags.join(" · ") || `${roles} roles` };
}

/** Education / certs required vs preferred on JD. */
function scoreEducationCredentials(
  jobText: string,
  candText: string
): { score: number; detail: string; applicable: boolean } {
  const j = jobText.toLowerCase();
  const c = candText.toLowerCase();
  const required: string[] = [];
  const preferred: string[] = [];

  const degPatterns: Array<{ re: RegExp; label: string }> = [
    { re: /\b(bachelor'?s?|b\.?s\.?|ba\b|undergraduate degree)\b/i, label: "Bachelor's" },
    { re: /\b(master'?s?|m\.?s\.?|mba|graduate degree)\b/i, label: "Master's/MBA" },
    { re: /\b(cpa|certified public accountant)\b/i, label: "CPA" },
    { re: /\b(pmp|project management professional)\b/i, label: "PMP" },
    { re: /\b(shrm|ph[r]|sphr)\b/i, label: "HR cert" },
    { re: /\b(pe\b|professional engineer)\b/i, label: "PE" },
    { re: /\b(cissp|security\+|compTIA)\b/i, label: "Security cert" },
  ];

  for (const p of degPatterns) {
    if (!p.re.test(j)) continue;
    const idx = j.search(p.re);
    const window = j.slice(Math.max(0, idx - 60), idx + 80);
    if (/preferred|nice to have|a plus|bonus|ideally/.test(window)) {
      preferred.push(p.label);
    } else {
      required.push(p.label);
    }
  }

  if (!required.length && !preferred.length) {
    return {
      score: 70,
      detail: "No specific education/credentials called out on JD",
      applicable: false,
    };
  }

  const has = (label: string) => {
    if (label === "Bachelor's")
      return /\b(bachelor|b\.?s\.?|ba\b|undergraduate|degree)\b/i.test(c);
    if (label === "Master's/MBA")
      return /\b(master|m\.?s\.?|mba|graduate degree)\b/i.test(c);
    if (label === "CPA") return /\bcpa\b/i.test(c);
    if (label === "PMP") return /\bpmp\b/i.test(c);
    return c.includes(label.toLowerCase().split(" ")[0]);
  };

  let score = 50;
  const notes: string[] = [];
  for (const r of required) {
    if (has(r)) {
      score += 20;
      notes.push(`Has required ${r}`);
    } else {
      score -= 25;
      notes.push(`Missing required ${r}`);
    }
  }
  for (const p of preferred) {
    if (has(p)) {
      score += 10;
      notes.push(`Has preferred ${p}`);
    } else {
      notes.push(`Preferred ${p} not shown`);
    }
  }
  score = Math.max(15, Math.min(100, score));
  return {
    score,
    detail: notes.slice(0, 4).join(" · ") || "Credentials checked",
    applicable: true,
  };
}

/** Keyword / context alignment — rewards multi-word contextual hits over isolated buzzwords. */
function scoreKeywordContext(
  candText: string,
  jobText: string
): { score: number; detail: string } {
  const domain = domainKeywordOverlap(candText, jobText);
  // Penalize thin resumes that only match short tokens
  const shortOnly =
    domain.hits.length > 0 &&
    domain.hits.every((h) => h.split(/\s+/).length === 1 && h.length < 8);
  let score = Math.round(domain.score * 100);
  if (shortOnly) score = Math.round(score * 0.65);
  if (domain.hits.length >= 5) score = Math.min(100, score + 8);
  const detail =
    domain.hits.length > 0
      ? `Context terms: ${domain.hits.slice(0, 6).join(", ")}${
          shortOnly ? " (mostly short tokens)" : ""
        }`
      : "Little terminology overlap beyond generic language";
  return { score: Math.max(10, Math.min(100, score)), detail };
}

function dim(
  id: FitDimensionId,
  label: string,
  score: number,
  detail: string,
  applicable = true
): FitDimensionScore {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return {
    id,
    label,
    score: s,
    grade: gradeFromScore(s),
    detail,
    applicable,
  };
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
  let exactHits = 0;
  let synHits = 0;
  for (const t of jobTokens) {
    if (candBlob.includes(t)) {
      hits += 1;
      exactHits += 1;
      continue;
    }
    const syns = TITLE_SYNONYMS[t] || [];
    if (syns.some((s) => candBlob.includes(s))) {
      hits += 0.75;
      synHits += 1;
    }
  }
  const ratio = hits / jobTokens.length;

  if (ratio >= 0.55) {
    strengths.push(
      `Title aligns with a ${jobTitle.trim()} role` +
        (synHits > 0 && exactHits === 0
          ? " (via related experience language)"
          : "")
    );
    reasons.push("Strong title/role alignment");
  } else if (ratio >= 0.3) {
    strengths.push(`Partial title alignment with "${jobTitle.trim()}"`);
    reasons.push("Partial title/role alignment");
  } else {
    gaps.push(`Limited title match vs "${jobTitle.trim()}"`);
    reasons.push("Weak title/role alignment");
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

  // --- Skills + domain ---
  const explicitSkills = (candidate.skills || [])
    .map(normalizeSkill)
    .filter(Boolean);
  const extractedCand = extractSkillsFromText(candText);
  const candidateSkills = Array.from(
    new Set([...explicitSkills, ...extractedCand])
  );

  const jobSkillsRaw = extractSkillsFromText(jobText);
  // Drop agency-noise skills (e.g. "recruiting" from "RYVAN Recruiting is searching…")
  const jobSkills = jobSkillsRaw.filter((s) => {
    if (!AGENCY_NOISE_SKILLS.has(s)) return true;
    // Keep only if JD truly asks for recruiting as a skill
    return /\b(experience (in|with) recruiting|recruiting experience|talent acquisition|sourcer)\b/i.test(
      jobText
    );
  });

  const effectiveJobSkills =
    jobSkills.length > 0
      ? jobSkills
      : (job.title || "")
          .toLowerCase()
          .split(/[\s,/|]+/)
          .map(normalizeSkill)
          .filter((s) => s.length > 2 && !AGENCY_NOISE_SKILLS.has(s));

  /** Optional JD skills (familiarity / or similar) get lower miss penalty */
  function skillImportance(skill: string): number {
    const lower = jobText.toLowerCase();
    const idx = lower.indexOf(skill.toLowerCase());
    if (idx < 0) {
      // try first token
      const tok = skill.split(/\s+/)[0];
      const i2 = lower.indexOf(tok);
      if (i2 < 0) return 1;
      const window = lower.slice(Math.max(0, i2 - 80), i2 + 80);
      if (
        /familiarity|nice to have|preferred|or similar|a plus|bonus/.test(window)
      ) {
        return 0.35;
      }
      return 1;
    }
    const window = lower.slice(Math.max(0, idx - 100), idx + skill.length + 100);
    if (
      /familiarity|nice to have|preferred|or similar|a plus|bonus|e\.g\./.test(
        window
      )
    ) {
      return 0.35;
    }
    // Core stack called out in "including X" / "proficiency" is important
    if (/proficiency|required|must|intermediate to advanced|including/.test(window)) {
      return 1.15;
    }
    return 1;
  }

  const skillsMatched: string[] = [];
  const skillsMissing: string[] = [];
  const skillsNear: string[] = [];
  const matchCreditBySkill = new Map<string, number>();
  let creditSum = 0;
  let weightSum = 0;

  for (const js of effectiveJobSkills) {
    const importance = skillImportance(js);
    weightSum += importance;
    const { credit, matchedAs } = skillMatchCredit(
      js,
      candidateSkills,
      candText
    );
    matchCreditBySkill.set(js, credit);
    if (credit >= 0.5) {
      creditSum += credit * importance;
      skillsMatched.push(prettySkill(js));
      if (credit < 0.99 && matchedAs && normalizeSkill(matchedAs) !== js) {
        skillsNear.push(prettySkill(js));
      }
    } else {
      // Optional / nice-to-have tools shouldn't tank the score
      if (importance <= 0.4) {
        creditSum += 0.55 * importance;
        skillsMissing.push(`${prettySkill(js)} (nice-to-have)`);
      } else if (importance >= 0.6) {
        skillsMissing.push(prettySkill(js));
      } else {
        skillsMissing.push(`${prettySkill(js)} (nice-to-have)`);
      }
    }
  }

  // Accounting cluster: if several core ops are present, don't treat sibling
  // ops (GL, month-end, JEs) as hard misses — they almost always co-occur.
  const clusterPresent = ACCOUNTING_CLUSTER.filter(
    (s) => (matchCreditBySkill.get(s) || 0) >= 0.5 || candidateSkills.includes(s)
  );
  // Also count free-text / extracted accounting presence
  const accountingDomainHits = domainKeywordOverlap(candText, jobText).hits;
  const hasAccountingDomain = accountingDomainHits.some((h) =>
    /account|quickbooks|bookkeep|ledger|reconcil|finance|fund/.test(h)
  );
  if (clusterPresent.length >= 3 || (clusterPresent.length >= 2 && hasAccountingDomain)) {
    for (const js of effectiveJobSkills) {
      if (!ACCOUNTING_CLUSTER.includes(js)) continue;
      const prev = matchCreditBySkill.get(js) || 0;
      if (prev >= 0.5) continue;
      const importance = skillImportance(js);
      const inferred = 0.82;
      matchCreditBySkill.set(js, inferred);
      creditSum += inferred * importance;
      skillsMatched.push(prettySkill(js));
      // Remove from hard missing
      const pretty = prettySkill(js);
      const idx = skillsMissing.findIndex(
        (m) => m === pretty || m.startsWith(pretty)
      );
      if (idx >= 0) skillsMissing.splice(idx, 1);
    }
  }

  // Client-facing inferred from implementation / training language
  if (
    effectiveJobSkills.includes("client-facing") &&
    (matchCreditBySkill.get("client-facing") || 0) < 0.5 &&
    /client|customer|training|onboarding|stakeholder|implementation support/i.test(
      candText
    )
  ) {
    const importance = skillImportance("client-facing");
    const prev = matchCreditBySkill.get("client-facing") || 0;
    if (prev < 0.5) {
      matchCreditBySkill.set("client-facing", 0.85);
      creditSum += 0.85 * importance;
      skillsMatched.push(prettySkill("client-facing"));
      const pretty = prettySkill("client-facing");
      const idx = skillsMissing.findIndex(
        (m) => m === pretty || m.startsWith(pretty)
      );
      if (idx >= 0) skillsMissing.splice(idx, 1);
    }
  }

  let skillsRatio = 0;
  if (weightSum <= 0) {
    skillsRatio = candidateSkills.length > 0 ? 0.55 : 0.4;
  } else {
    // Recompute from map for accuracy after cluster inference
    creditSum = 0;
    for (const js of effectiveJobSkills) {
      const importance = skillImportance(js);
      const credit = matchCreditBySkill.get(js) || 0;
      if (credit >= 0.5) creditSum += credit * importance;
      else if (importance <= 0.4) creditSum += 0.55 * importance;
    }
    skillsRatio = Math.min(1, creditSum / weightSum);
    if (candidateSkills.length >= 6 && skillsRatio > 0.35) {
      skillsRatio = Math.min(1, skillsRatio + 0.05);
    }
  }

  const domain = domainKeywordOverlap(candText, jobText);

  // Strong domain + solid skill base → realistic finance-role scores (high 70s–80s+)
  let blendedSkills = Math.min(1, skillsRatio * 0.68 + domain.score * 0.42);
  if (domain.score >= 0.4 && skillsRatio >= 0.4) {
    blendedSkills = Math.max(blendedSkills, 0.8);
  }
  if (domain.score >= 0.5 && skillsRatio >= 0.5) {
    blendedSkills = Math.max(blendedSkills, 0.88);
  }
  if (domain.score >= 0.55 && skillsRatio >= 0.6) {
    blendedSkills = Math.max(blendedSkills, 0.93);
  }
  // Accounting-heavy JD + strong accounting domain → don't sit at mid-70s
  const jobIsFinanceHeavy =
    effectiveJobSkills.filter((s) => ACCOUNTING_CLUSTER.includes(s)).length >= 4;
  if (jobIsFinanceHeavy && hasAccountingDomain && skillsRatio >= 0.45) {
    blendedSkills = Math.max(blendedSkills, 0.86);
  }

  // --- Title (20%) ---
  const titlePart = titleKeywordScore(
    candidate.title || "",
    job.title || "",
    candText
  );

  // --- Location (10%) ---
  const locPart = locationSoftMatch(
    candidate.location,
    job.location,
    job.description
  );

  // --- Seniority / years (10%) ---
  // Title-first only — scanning full resume text creates false "executive" hits.
  const jobSen = detectSeniority(job.title || "specialist");
  const titleLooksLikePersonName = (t: string) => {
    const parts = t.trim().split(/\s+/);
    return (
      parts.length >= 2 &&
      parts.length <= 4 &&
      parts.every((p) => /^[A-Z][a-z'’-]+$/.test(p) || /^[A-Z]\.$/.test(p))
    );
  };
  const candTitle = candidate.title || "";
  const candSen = detectSeniority(
    titleLooksLikePersonName(candTitle)
      ? `${candidate.summary || ""}`.slice(0, 280)
      : `${candTitle} ${(candidate.summary || "").slice(0, 200)}`
  );
  const years = estimateYearsFromExperience(candidate.experience);

  let yearsLevel = 1;
  if (years >= 12) yearsLevel = 4; // long tenure ≠ executive title
  else if (years >= 8) yearsLevel = 3;
  else if (years >= 5) yearsLevel = 3;
  else if (years >= 2) yearsLevel = 2;

  const effectiveCandLevel = Math.max(candSen.level, yearsLevel);
  const levelDiff = Math.abs(effectiveCandLevel - jobSen.level);
  let seniorityScore = 1;
  if (effectiveCandLevel >= jobSen.level) {
    // Over-qualified for mid specialist roles is fine — do not punish
    seniorityScore = 1;
  } else if (levelDiff === 1) {
    seniorityScore = 0.8;
  } else if (levelDiff === 2) {
    seniorityScore = 0.55;
  } else {
    seniorityScore = 0.35;
  }

  // --- Split: domain fit vs tool readiness ---
  let domainSkillCredit = 0;
  let domainSkillWeight = 0;
  let toolSkillCredit = 0;
  let toolSkillWeight = 0;
  const toolsMatched: string[] = [];
  const toolsMissing: string[] = [];

  for (const js of effectiveJobSkills) {
    const importance = skillImportance(js);
    const credit = matchCreditBySkill.get(js) || 0;
    if (isToolSkill(js)) {
      toolSkillWeight += importance;
      if (credit >= 0.5) {
        toolSkillCredit += credit * importance;
        toolsMatched.push(prettySkill(js));
      } else if (importance <= 0.4) {
        toolSkillCredit += 0.55 * importance;
        toolsMissing.push(`${prettySkill(js)} (nice-to-have)`);
      } else {
        toolsMissing.push(prettySkill(js));
      }
    } else {
      domainSkillWeight += importance;
      if (credit >= 0.5) {
        domainSkillCredit += credit * importance;
      } else if (importance <= 0.4) {
        domainSkillCredit += 0.55 * importance;
      }
    }
  }

  const domainSkillsRatio =
    domainSkillWeight > 0
      ? Math.min(1, domainSkillCredit / domainSkillWeight)
      : skillsRatio;
  const toolsApplicable = toolSkillWeight > 0;
  const toolSkillsRatio = toolsApplicable
    ? Math.min(1, toolSkillCredit / toolSkillWeight)
    : 1;

  // Domain fit: core function + title + domain language + location + seniority
  let domainBlended = Math.min(
    1,
    domainSkillsRatio * 0.5 + domain.score * 0.35 + titlePart.score * 0.15
  );
  if (domain.score >= 0.4 && domainSkillsRatio >= 0.35) {
    domainBlended = Math.max(domainBlended, 0.78);
  }
  if (domain.score >= 0.5 && domainSkillsRatio >= 0.45) {
    domainBlended = Math.max(domainBlended, 0.86);
  }
  if (domain.score >= 0.55 && domainSkillsRatio >= 0.55) {
    domainBlended = Math.max(domainBlended, 0.92);
  }
  if (jobIsFinanceHeavy && hasAccountingDomain && domainSkillsRatio >= 0.4) {
    domainBlended = Math.max(domainBlended, 0.88);
  }

  const domainFitScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (domainBlended * 0.75 + locPart.score * 0.1 + seniorityScore * 0.15) *
          100
      )
    )
  );
  const domainFit: FitSplitScore = {
    score: domainFitScore,
    grade: gradeFromScore(domainFitScore),
    applicable: true,
  };

  const toolReadinessScore = toolsApplicable
    ? Math.max(0, Math.min(100, Math.round(toolSkillsRatio * 100)))
    : 100;
  const toolReadiness: FitSplitScore = {
    score: toolReadinessScore,
    grade: gradeFromScore(toolReadinessScore),
    applicable: toolsApplicable,
  };

  // --- Exact vs adjacent skill matches ---
  let skillsExactCount = 0;
  let skillsAdjacentCount = 0;
  for (const js of effectiveJobSkills) {
    const credit = matchCreditBySkill.get(js) || 0;
    if (credit >= 0.99) skillsExactCount += 1;
    else if (credit >= 0.5) skillsAdjacentCount += 1;
  }
  const skillsExactRatio =
    effectiveJobSkills.length > 0
      ? skillsExactCount / effectiveJobSkills.length
      : 0.5;
  const skillsAdjRatio =
    effectiveJobSkills.length > 0
      ? skillsAdjacentCount / effectiveJobSkills.length
      : 0;
  // Exact matches weigh more than adjacent/transferable
  const skillsMatchScore = Math.round(
    Math.min(
      100,
      (skillsExactRatio * 0.75 + skillsAdjRatio * 0.45 + skillsRatio * 0.25) *
        100
    )
  );

  // Years of relevant experience
  const requiredYears = parseRequiredYears(jobText);
  let yearsScore = 70;
  let yearsDetail = years > 0 ? `~${years} years estimated on profile` : "Years not clear on profile";
  if (requiredYears != null && years > 0) {
    const ratio = years / requiredYears;
    if (ratio >= 0.85 && ratio <= 1.6) {
      yearsScore = 90;
      yearsDetail = `~${years}y vs ~${requiredYears}y required — aligned`;
    } else if (ratio < 0.85) {
      yearsScore = Math.max(25, Math.round(ratio * 85));
      yearsDetail = `~${years}y vs ~${requiredYears}y required — may be under-qualified`;
    } else {
      // Over-qualified: still strong but flag
      yearsScore = 82;
      yearsDetail = `~${years}y vs ~${requiredYears}y required — may be over-qualified`;
    }
  } else if (years >= 8) {
    yearsScore = 88;
  } else if (years >= 4) {
    yearsScore = 78;
  } else if (years >= 2) {
    yearsScore = 65;
  } else if (years > 0) {
    yearsScore = 50;
  }

  // Seniority & scope (team/budget/P&L signals)
  let scopeBonus = 0;
  const scopeHits: string[] = [];
  if (/\b(team of \d+|managed \d+|direct reports|span of control)\b/i.test(candText)) {
    scopeBonus += 0.08;
    scopeHits.push("team size");
  }
  if (/\b(budget|p&l|p \/ l|profit and loss|\$\d)/i.test(candText)) {
    scopeBonus += 0.08;
    scopeHits.push("budget/P&L");
  }
  const seniorityDimScore = Math.round(
    Math.min(1, seniorityScore + scopeBonus) * 100
  );
  const seniorityDetail =
    `Level: profile ${candSen.label} vs role ${jobSen.label}` +
    (scopeHits.length ? ` · Scope: ${scopeHits.join(", ")}` : "");

  // Responsibilities overlap (title + skills coverage + domain)
  const respScore = Math.round(
    Math.min(
      1,
      titlePart.score * 0.35 + skillsRatio * 0.4 + domain.score * 0.25
    ) * 100
  );

  const achievements = scoreAchievements(candText);
  const trajectory = scoreCareerTrajectory(candidate.experience);
  const education = scoreEducationCredentials(jobText, candText);
  const keywordCtx = scoreKeywordContext(candText, jobText);

  const dimensions: FitDimensionScore[] = [
    dim(
      "skills_match",
      "Skills match",
      toolsApplicable
        ? Math.round(skillsMatchScore * 0.55 + toolReadinessScore * 0.45)
        : skillsMatchScore,
      `${skillsExactCount} exact · ${skillsAdjacentCount} adjacent/transferable` +
        (toolsApplicable
          ? ` · Tools ${toolReadinessScore}/100`
          : " · No tool stack on JD")
    ),
    dim(
      "years_experience",
      "Years of relevant experience",
      yearsScore,
      yearsDetail
    ),
    dim(
      "industry_domain",
      "Industry / domain fit",
      Math.round(domain.score * 100),
      summarizeDomainHits(domain.hits) ||
        (domain.hits.length
          ? `Domain terms: ${domain.hits.slice(0, 5).join(", ")}`
          : "Limited same-sector language")
    ),
    dim(
      "seniority_scope",
      "Seniority & scope",
      seniorityDimScore,
      seniorityDetail
    ),
    dim(
      "achievements",
      "Measurable achievements",
      achievements.score,
      achievements.detail
    ),
    dim(
      "responsibilities",
      "Role-specific responsibilities",
      respScore,
      `${Math.round(skillsRatio * 100)}% skill coverage · title alignment ${Math.round(titlePart.score * 100)}`
    ),
    dim(
      "education_credentials",
      "Education & credentials",
      education.score,
      education.detail,
      education.applicable
    ),
    dim(
      "career_trajectory",
      "Career trajectory & stability",
      trajectory.score,
      trajectory.detail
    ),
    dim(
      "location_arrangement",
      "Location / work arrangement",
      Math.round(locPart.score * 100),
      locPart.reason || "Location scored"
    ),
    dim(
      "keyword_context",
      "Keyword & context alignment",
      keywordCtx.score,
      keywordCtx.detail
    ),
  ];

  const applicableDims = dimensions.filter((d) => d.applicable);
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        applicableDims.reduce((s, d) => s + d.score, 0) /
          Math.max(1, applicableDims.length)
      )
    )
  );
  const grade = gradeFromScore(score);

  // Compact badges still use domain rollup + tools
  // domainFit already computed; keep it as a recruiter-facing rollup
  // of industry + years + seniority + responsibilities (not full overall)
  const domainRollup = Math.round(
    (dimensions.find((d) => d.id === "industry_domain")!.score +
      dimensions.find((d) => d.id === "years_experience")!.score +
      dimensions.find((d) => d.id === "seniority_scope")!.score +
      dimensions.find((d) => d.id === "responsibilities")!.score) /
      4
  );
  domainFit.score = domainRollup;
  domainFit.grade = gradeFromScore(domainRollup);

  // --- Human-readable strengths / gaps (no raw ≈ dumps) ---
  const reasons: string[] = [];
  const strengths: string[] = [];
  const gaps: string[] = [];

  reasons.push(
    `Overall ${score}/100 (${grade}) · Domain ${domainFit.score} · Tools ${
      toolsApplicable ? toolReadinessScore : "n/a"
    }`
  );
  for (const d of applicableDims) {
    if (d.score >= 80) {
      strengths.push(`${d.label}: ${d.detail}`);
    } else if (d.score < 55) {
      gaps.push(`${d.label}: ${d.detail}`);
    }
  }

  if (titlePart.score >= 0.45) {
    strengths.push(
      titlePart.strengths[0] ||
        `Role alignment with "${job.title || "this job"}"`
    );
  } else if (titlePart.gaps[0]) {
    gaps.push(titlePart.gaps[0]);
  }

  if (skillsMatched.length > 0) {
    const ordered = sortSkillsForDisplay(skillsMatched).slice(0, 7);
    const core = ordered.join(", ");
    strengths.push(
      skillsExactCount > 0
        ? `Exact skill hits: ${core}`
        : `Adjacent/transferable skills: ${core}`
    );
    reasons.push(
      `${skillsExactCount} exact · ${skillsAdjacentCount} adjacent of ${effectiveJobSkills.length} job skills`
    );
  } else if (effectiveJobSkills.length > 0 && domain.hits.length === 0) {
    reasons.push("Few job skills evidenced on the profile/resume");
  }

  if (domain.hits.length > 0) {
    const themes = summarizeDomainHits(domain.hits);
    if (themes) strengths.push(themes);
  }

  // Prefer real product/tool gaps over accounting ops already implied by domain
  const hardMissing = skillsMissing
    .filter((s) => !/\(nice-to-have\)/i.test(s))
    .filter((s) => {
      const n = normalizeSkill(s);
      if (
        hasAccountingDomain &&
        clusterPresent.length >= 2 &&
        ACCOUNTING_CLUSTER.includes(n)
      ) {
        return false;
      }
      if (
        n === "client-facing" &&
        /implement|client|training|onboard/i.test(domain.hits.join(" "))
      ) {
        return false;
      }
      return true;
    })
    .slice(0, 4);

  const hardToolsMissing = toolsMissing
    .filter((s) => !/\(nice-to-have\)/i.test(s))
    .slice(0, 5);

  if (toolsApplicable && hardToolsMissing.length > 0) {
    gaps.push(
      `Tool stack not clearly shown: ${hardToolsMissing.join(", ")}`
    );
  } else if (hardMissing.length > 0 && skillsRatio < 0.9) {
    gaps.push(`Confirm experience with: ${hardMissing.join(", ")}`);
  }

  if (requiredYears != null && years > 0 && years < requiredYears * 0.85) {
    gaps.push(yearsDetail);
  } else if (requiredYears != null && years > requiredYears * 1.6) {
    gaps.push(yearsDetail);
  }

  if (effectiveCandLevel < jobSen.level && levelDiff >= 2) {
    gaps.push(
      `May be light on seniority for this level (profile reads ${candSen.label}, role reads ${jobSen.label})`
    );
  }

  reasons.push(...titlePart.reasons);

  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

  return {
    score,
    grade,
    domainFit,
    toolReadiness,
    dimensions,
    skillsExactCount,
    skillsAdjacentCount,
    reasons: uniq(reasons).slice(0, 12),
    strengths: uniq(strengths).slice(0, 10),
    gaps: uniq(gaps).slice(0, 8),
    skillsMatched: uniq(skillsMatched),
    skillsMissing: uniq(
      skillsMissing.map((s) => s.replace(/\s*\(nice-to-have\)/i, ""))
    ),
    toolsMatched: uniq(toolsMatched),
    toolsMissing: uniq(
      toolsMissing.map((s) => s.replace(/\s*\(nice-to-have\)/i, ""))
    ),
  };
}

function prettySkill(s: string): string {
  const t = normalizeSkill(s);
  if (!t) return s;
  // Title-case multi-word skills for display
  return t
    .split(" ")
    .map((w) => {
      if (["ap", "ar", "gl", "hr", "ui", "ux"].includes(w)) return w.toUpperCase();
      if (w.includes(".")) return w; // bill.com, node.js
      if (w === "quickbooks") return "QuickBooks";
      if (w === "1099s") return "1099s";
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function summarizeDomainHits(hits: string[]): string {
  const h = hits.map((x) => x.toLowerCase());
  const bits: string[] = [];
  if (h.some((x) => /account|quickbooks|bookkeep|ledger|reconcil|ap\/ar|finance/.test(x))) {
    bits.push("accounting/finance operations");
  }
  if (h.some((x) => /nonprofit|ministry|church|donor/.test(x))) {
    bits.push("nonprofit / ministry context");
  }
  if (h.some((x) => /implement|onboard|migration|training|client/.test(x))) {
    bits.push("implementation / client work");
  }
  if (!bits.length) return "";
  return `Domain experience signals: ${bits.join("; ")}`;
}

/**
 * Build a structured reviewer-facing assessment from a fit score result.
 */
export function buildReviewerAssessment(
  result: FitScoreResult
): FitReviewAssessment {
  const domain = result.domainFit ?? {
    score: result.score,
    grade: result.grade,
    applicable: true,
  };
  const tools = result.toolReadiness ?? {
    score: result.score,
    grade: result.grade,
    applicable: false,
  };
  const toolsApply = tools.applicable !== false && tools.score != null;
  const dimensions = result.dimensions || [];

  let headline: string;
  let summary: string;

  if (toolsApply && domain.score >= 85 && tools.score < 70) {
    headline = "Strong domain fit — tool stack still unproven";
    summary =
      "Functional/domain signals look strong, but named tools or implementation skills from the JD are thin. Screen hard on stack before treating as a full advance.";
  } else if (toolsApply && domain.score >= 70 && tools.score < 55) {
    headline = "Solid domain, weak tool readiness";
    summary =
      "Core experience aligns with the role, but several tools/systems are not evidenced. Confirm stack fit before prioritizing.";
  } else if (result.score >= 85) {
    headline = "Strong multi-factor fit — likely worth advancing";
    summary =
      "Across skills, domain, seniority, and related factors the profile reads as a credible match for this role.";
  } else if (result.score >= 70) {
    headline = "Good fit — promising with a few checks";
    summary =
      "Solid overlap overall; review lower-scoring dimensions below before advancing.";
  } else if (result.score >= 55) {
    headline = "Partial fit — useful but needs validation";
    summary =
      "Some alignment, but several factors are soft. Use the dimension scores to decide next step.";
  } else if (result.score >= 40) {
    headline = "Weak fit — likely not a top priority";
    summary =
      "The profile is only loosely aligned across the scored factors.";
  } else {
    headline = "Poor fit — not a strong match on paper";
    summary =
      "Multi-factor scoring finds limited alignment with this JD.";
  }

  const confidence: FitReviewAssessment["confidence"] =
    result.score >= 80 && (!toolsApply || tools.score >= 70)
      ? "high"
      : result.score >= 60
        ? "medium"
        : "low";

  return {
    score: result.score,
    grade: result.grade,
    domainFit: domain,
    toolReadiness: tools,
    dimensions,
    headline,
    summary,
    strengths: result.strengths.slice(0, 6),
    gaps: result.gaps.slice(0, 6),
    matchedSkills: result.skillsMatched.slice(0, 8),
    missingSkills: result.skillsMissing.slice(0, 6),
    toolsMatched: (result.toolsMatched || []).slice(0, 8),
    toolsMissing: (result.toolsMissing || []).slice(0, 6),
    confidence,
  };
}

/**
 * Human-readable fit summary for activity notes + expandable UI.
 */
export function formatFitSummary(result: FitScoreResult): string {
  const assessment = buildReviewerAssessment(result);
  const lines: string[] = [
    `Overall ${assessment.score}/100 · Grade ${assessment.grade}`,
    `Domain rollup ${assessment.domainFit.score}/100 · Grade ${assessment.domainFit.grade}`,
    assessment.toolReadiness.applicable === false
      ? `Tool readiness n/a · No tool stack called out on JD`
      : `Tool readiness ${assessment.toolReadiness.score}/100 · Grade ${assessment.toolReadiness.grade}`,
    assessment.headline,
    "",
    assessment.summary,
  ];

  if (assessment.dimensions?.length) {
    lines.push("");
    lines.push("Factor scores");
    for (const d of assessment.dimensions) {
      if (!d.applicable) {
        lines.push(`• ${d.label}: n/a — ${d.detail}`);
      } else {
        lines.push(
          `• ${d.label}: ${d.score}/100 (${d.grade}) — ${d.detail}`
        );
      }
    }
  }

  if (assessment.strengths.length) {
    lines.push("");
    lines.push("Why it fits");
    for (const s of assessment.strengths) {
      lines.push(`• ${s}`);
    }
  }

  if (assessment.gaps.length) {
    lines.push("");
    lines.push("Worth checking");
    for (const g of assessment.gaps) {
      lines.push(`• ${g}`);
    }
  }

  if (assessment.matchedSkills.length) {
    lines.push("");
    lines.push(`Skills evidenced: ${assessment.matchedSkills.join(", ")}`);
  }

  if (assessment.toolsMatched.length) {
    lines.push("");
    lines.push(`Tools evidenced: ${assessment.toolsMatched.join(", ")}`);
  }

  if (assessment.toolsMissing.length) {
    lines.push("");
    lines.push(`Tool gaps: ${assessment.toolsMissing.join(", ")}`);
  } else if (assessment.missingSkills.length) {
    lines.push("");
    lines.push(`Potential gaps: ${assessment.missingSkills.join(", ")}`);
  }

  return lines.join("\n");
}
