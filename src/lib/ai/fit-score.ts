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
};

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
  { pattern: /\b(staff|principal|lead|architect)\b/i, level: 4, label: "lead" },
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

function locationSoftMatch(candidateLoc?: string, jobLoc?: string): {
  score: number; // 0-1
  reason?: string;
} {
  const c = normalizeLocation(candidateLoc);
  const j = normalizeLocation(jobLoc);
  if (!j) return { score: 0.5 }; // neutral when job has no location
  if (!c) return { score: 0.35, reason: "Candidate location unknown" };

  if (c === j) return { score: 1, reason: "Location exact match" };

  // Remote flexibility
  const jobRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(j);
  const candRemote = /\bremote\b|\bopen to remote\b/i.test(c);
  if (jobRemote || candRemote) {
    return { score: 0.85, reason: "Remote / flexible location" };
  }

  // City or state substring
  const cParts = c.split(/[,\s/]+/).filter((p) => p.length > 2);
  const jParts = j.split(/[,\s/]+/).filter((p) => p.length > 2);
  const overlap = cParts.filter((p) => jParts.includes(p) || j.includes(p));
  if (overlap.length > 0) {
    return { score: 0.75, reason: `Location partial match (${overlap[0]})` };
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
    }
  }
  const ratio = hits / jobTokens.length;

  if (ratio >= 0.6) {
    strengths.push(`Title/role alignment: ${matched.slice(0, 4).join(", ")}`);
    reasons.push("Strong title/role keyword overlap");
  } else if (ratio >= 0.3) {
    reasons.push("Partial title/role keyword overlap");
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

  // --- Skills (60%) ---
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

  const candSet = new Set(candidateSkills);
  const skillsMatched = effectiveJobSkills.filter((s) => candSet.has(s));
  const skillsMissing = effectiveJobSkills.filter((s) => !candSet.has(s));

  let skillsRatio = 0;
  if (effectiveJobSkills.length === 0) {
    skillsRatio = candidateSkills.length > 0 ? 0.55 : 0.4;
  } else {
    skillsRatio = skillsMatched.length / effectiveJobSkills.length;
    // Bonus for having extra relevant depth (capped)
    if (candidateSkills.length >= effectiveJobSkills.length && skillsRatio > 0) {
      skillsRatio = Math.min(1, skillsRatio + 0.05);
    }
  }

  // --- Title (20%) ---
  const titlePart = titleKeywordScore(
    candidate.title || "",
    job.title || "",
    candidate.summary || ""
  );

  // --- Location (10%) ---
  const locPart = locationSoftMatch(candidate.location, job.location);

  // --- Seniority / years (10%) ---
  const jobSen = detectSeniority(`${job.title || ""} ${job.description || ""}`);
  const candSen = detectSeniority(
    `${candidate.title || ""} ${candidate.summary || ""}`
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
  else if (levelDiff === 1) seniorityScore = 0.7;
  else if (levelDiff === 2) seniorityScore = 0.4;
  else seniorityScore = 0.2;

  // Slight boost if years look solid and job is senior+
  if (jobSen.level >= 3 && years >= 5) {
    seniorityScore = Math.min(1, seniorityScore + 0.1);
  }

  const weighted =
    skillsRatio * 0.6 +
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
      `${skillsMatched.length}/${effectiveJobSkills.length || "?"} required skills matched`
    );
  } else if (effectiveJobSkills.length > 0) {
    reasons.push("No required skills matched from job description");
  }

  if (skillsMissing.length > 0) {
    gaps.push(
      `Missing skills: ${skillsMissing.slice(0, 6).join(", ")}${
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
