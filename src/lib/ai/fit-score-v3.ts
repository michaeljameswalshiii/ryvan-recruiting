/**
 * Trio Fit Score Version 3 — capability-first triage rubric.
 *
 * Composite = Experience 35 + Industry 25 + Skills 25 + Location 15.
 * Unknowns are questions, never deductions. Degrees/titles are not gates.
 */

import { assessFieldFit } from "@/lib/ai/occupation-fields";
import type {
  FitCandidateInput,
  FitGrade,
  FitHardGate,
  FitJobInput,
  FitRubricFactor,
  FitScoreResult,
  FitSplitScore,
} from "@/lib/ai/fit-score";

export type FitBand = "Strong fit" | "Good fit" | "Review" | "Weak fit";
export type HmReachOut = "Yes" | "Maybe" | "No";

export type FitScoreV3 = FitScoreResult & {
  scoringVersion: "v3";
  band: FitBand;
  hmReachOut: HmReachOut;
  hmReason: string;
  llmUsed?: boolean;
  llmModel?: string;
};

function stripHtml(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blob(candidate: FitCandidateInput): string {
  return [
    candidate.title,
    candidate.summary,
    ...(candidate.skills || []),
    ...(candidate.experience || []).flatMap((e) => [
      e.title,
      e.company,
      e.dates,
      e.description,
    ]),
    candidate.location,
  ]
    .filter(Boolean)
    .join("\n");
}

function jobBlob(job: FitJobInput): string {
  return stripHtml(
    [job.title, job.description, job.location, job.companyName, job.salaryRange]
      .filter(Boolean)
      .join("\n")
  );
}

function has(text: string, re: RegExp): boolean {
  return re.test(text);
}

function countHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function bandFromScore(score: number): FitBand {
  if (score >= 85) return "Strong fit";
  if (score >= 70) return "Good fit";
  if (score >= 55) return "Review";
  return "Weak fit";
}

export function gradeFromBand(score: number): FitGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

const DUTY_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "manufacturing operations leadership", re: /\b(director of (manufacturing|operations|ops)|vp of operations|plant manager|manufacturing (director|manager)|operations (director|manager))\b/i },
  { label: "production leadership", re: /\b(production|throughput|capacity|shop floor|manufacturing operations)\b/i },
  { label: "engineering / process", re: /\b(manufacturing engineering|process (development|engineering)|npi|new product introduction|dfm)\b/i },
  { label: "quality systems", re: /\b(quality|pfmea|process validation|iso|as9100|qms|capa)\b/i },
  { label: "continuous improvement", re: /\b(lean|six sigma|kaizen|dmaic|5s|value stream|oee)\b/i },
  { label: "team leadership", re: /\b(direct reports|team of \d+|organization of \d+|associates|managed \d+|coaching|mentoring|succession)\b/i },
  { label: "scheduling / capacity", re: /\b(schedul|capacity planning|labor utilization|resource allocation)\b/i },
  { label: "cost / P&L", re: /\b(p&l|profit and loss|budget|forecast|margin|cost (control|reduction|analysis)|capital)\b/i },
  { label: "cross-functional ops", re: /\b(cross[- ]functional|supply chain|maintenance|procurement|engineering, quality)\b/i },
  { label: "NPI / customer", re: /\b(new product|npi|customer|regulated|compliance|aerospace|medical|defense)\b/i },
];

const INDUSTRY_DIRECT: RegExp[] = [
  /\bprecision (manufactur|machin|metal)\b/i,
  /\b(cnc|swiss machining|wire edm|metal forming|stamping|deep draw|fabrication)\b/i,
  /\b(aerospace|defense|medical device|regulated manufactur)\b/i,
  /\b(manufacturing|plant operations|production operations)\b/i,
  /\b(lean manufacturing|six sigma|continuous improvement)\b/i,
];

const NAMED_SOFTWARE: Array<{ name: string; re: RegExp }> = [
  { name: "Oracle", re: /\boracle\b/i },
  { name: "SAP", re: /\bsap\b/i },
  { name: "Procore", re: /\bprocore\b/i },
  { name: "Bluebeam", re: /\bbluebeam\b/i },
  { name: "MS Project", re: /\b(ms project|microsoft project)\b/i },
  { name: "Tekla", re: /\btekla\b/i },
  { name: "SolidWorks", re: /\bsolidworks\b/i },
  { name: "CATIA", re: /\bcatia\b/i },
  { name: "Creo", re: /\b(creo|pro\/?e)\b/i },
  { name: "Minitab", re: /\bminitab\b/i },
  { name: "AutoCAD", re: /\bautocad\b/i },
  { name: "Epicor", re: /\bepicor\b/i },
  { name: "NetSuite", re: /\bnetsuite\b/i },
];

const METHOD_SKILLS: Array<{ name: string; jd: RegExp; cand: RegExp }> = [
  { name: "Lean", jd: /\blean\b/i, cand: /\blean\b/i },
  { name: "Six Sigma", jd: /\bsix sigma\b/i, cand: /\b(six sigma|dmaic|black belt|green belt)\b/i },
  { name: "Kaizen", jd: /\bkaizen\b/i, cand: /\bkaizen\b/i },
  { name: "5S", jd: /\b5s\b/i, cand: /\b5s\b/i },
  { name: "VSM", jd: /\bvalue stream\b/i, cand: /\bvalue stream\b/i },
  { name: "OEE", jd: /\boee\b/i, cand: /\boee\b/i },
  { name: "PFMEA", jd: /\b(pfmea|fmea)\b/i, cand: /\b(pfmea|fmea)\b/i },
  { name: "NPI", jd: /\b(new product introduction|\bnpi\b)\b/i, cand: /\b(npi|new product introduction)\b/i },
  { name: "DFM", jd: /\bdfm\b/i, cand: /\bdfm\b/i },
];

function scoreExperience(cand: string, job: string, candidate: FitCandidateInput): {
  points: number;
  detail: string;
  verify: string[];
} {
  const verify: string[] = [];
  const hits = DUTY_PATTERNS.filter((d) => d.re.test(cand)).map((d) => d.label);
  const jdHits = DUTY_PATTERNS.filter((d) => d.re.test(job)).map((d) => d.label);
  const overlap = hits.filter((h) => jdHits.includes(h) || DUTY_PATTERNS.some((d) => d.label === h));
  const coverage = jdHits.length
    ? overlap.length / Math.max(1, jdHits.length)
    : hits.length / DUTY_PATTERNS.length;

  const seniorTitle = has(
    `${candidate.title || ""}\n${cand}`,
    /\b(director|vp |vice president|plant manager|head of|chief)\b/i
  );
  const managerTitle = has(cand, /\b(manager|supervisor|lead )\b/i);
  const yearsHint = /\b(1[5-9]|[2-4]\d)\+?\s*years\b/i.test(job)
    ? 15
    : 0;
  const longTenure = has(cand, /\b(2015|2014|2013|2012|2011|2010|2009|2008|2007|2006|2001|1999|1997)\b/);

  let points = 16;
  if (coverage >= 0.55 && (seniorTitle || managerTitle)) points = 30;
  else if (coverage >= 0.4) points = 26;
  else if (coverage >= 0.25) points = 21;
  else if (hits.length >= 3) points = 20;
  else points = 14;

  if (seniorTitle && hits.length >= 5) points = Math.max(points, 32);
  if (seniorTitle && overlap.length >= 6) points = Math.max(points, 33);
  if (longTenure && points >= 26) points = Math.min(35, points + 1);
  if (yearsHint && !longTenure) {
    verify.push("Confirm years of manufacturing leadership vs the stated 15+ requirement");
  }

  const missingDuty = jdHits.filter((h) => !hits.includes(h));
  if (missingDuty.includes("cost / P&L")) {
    verify.push("Confirm facility P&L ownership — not stated explicitly on the resume");
  }

  points = clamp(points, 0, 35);
  const detail =
    points >= 28
      ? `Demonstrated ownership of core ops duties (${hits.slice(0, 4).join(", ") || "leadership trajectory"})`
      : points >= 17
        ? `Likely can do the job; some duties inferred (${hits.slice(0, 3).join(", ") || "partial overlap"})`
        : `Limited demonstrated ownership of this role's core duties`;
  return { points, detail, verify };
}

function scoreIndustry(cand: string, job: string): { points: number; detail: string; verify: string[] } {
  const verify: string[] = [];
  const field = assessFieldFit({
    jobTitle: job.slice(0, 200),
    jobDescription: job,
    candidateTitle: cand.slice(0, 200),
    candidateSummary: cand,
  });
  const directHits = countHits(cand, INDUSTRY_DIRECT);
  const jobPrecision = /\b(precision|cnc|metal forming|stamping|swiss|edm)\b/i.test(job);
  const candPrecision = /\b(precision|cnc|aerospace|defense|medical|regulated|machin|fabricat)\b/i.test(cand);
  const sameMfg = field.alignment === "same" || /\bmanufactur/i.test(cand);

  let points = 10;
  if (sameMfg && (candPrecision || !jobPrecision)) points = 22;
  if (sameMfg && candPrecision && jobPrecision) points = 23;
  if (field.alignment === "same" && directHits >= 3) points = 24;
  if (field.alignment === "adjacent") points = Math.max(points, 16);
  if (field.alignment === "unrelated") points = Math.min(points, 10);

  if (jobPrecision && !/\b(cnc|swiss|edm|stamping|deep draw)\b/i.test(cand)) {
    verify.push("Confirm exposure to precision metal forming / CNC / Swiss / EDM processes");
  }

  points = clamp(points, 0, 25);
  const detail =
    points >= 20
      ? `Direct domain alignment (${field.candidateLabel || field.jobLabel})`
      : points >= 12
        ? `Same broad industry, different niche — ${field.reason}`
        : `Adjacent or thin industry signal — ${field.reason}`;
  return { points, detail, verify };
}

function scoreSkills(cand: string, job: string): {
  points: number;
  detail: string;
  verify: string[];
  matched: string[];
  missing: string[];
} {
  const verify: string[] = [];
  const matched: string[] = [];
  const missing: string[] = [];

  const jdSoftware = NAMED_SOFTWARE.filter((s) => s.re.test(job));
  const candSoftware = NAMED_SOFTWARE.filter((s) => s.re.test(cand));
  for (const s of jdSoftware) {
    if (candSoftware.some((c) => c.name === s.name)) matched.push(s.name);
    else verify.push(`Confirm ${s.name} if the hiring manager cares — not shown on the resume`);
  }
  for (const s of candSoftware) {
    if (!matched.includes(s.name)) matched.push(s.name);
  }

  const jdMethods = METHOD_SKILLS.filter((s) => s.jd.test(job));
  for (const s of jdMethods) {
    if (s.cand.test(cand)) matched.push(s.name);
    else {
      missing.push(s.name);
      verify.push(`${s.name} is named on the JD and not explicit on the resume`);
    }
  }

  const methodCover = jdMethods.length
    ? jdMethods.filter((s) => s.cand.test(cand)).length / jdMethods.length
    : 1;
  const softCover = jdSoftware.length
    ? jdSoftware.filter((s) => candSoftware.some((c) => c.name === s.name)).length /
      jdSoftware.length
    : 1;

  let points = 18;
  if (methodCover >= 0.6 && (softCover >= 0.4 || jdSoftware.length === 0)) points = 21;
  if (methodCover >= 0.75 && matched.length >= 5) points = 23;
  if (methodCover >= 0.85 && matched.length >= 6) points = 24;
  if (methodCover < 0.35 && jdMethods.length >= 3) points = 14;
  if (jdMethods.length === 0 && matched.length >= 3) points = 20;

  // Missing nice-to-haves barely move the score; never collapse to 0–11 for unmentioned items.
  points = clamp(points, 12, 25);
  const detail =
    points >= 20
      ? `Covers key methods/tools: ${matched.slice(0, 6).join(", ") || "core ops toolkit"}`
      : `Covers most; confirm ${missing.slice(0, 3).join(", ") || "a few named methods"}`;
  return { points, detail, verify, matched, missing };
}

function scoreLocation(candidate: FitCandidateInput, job: FitJobInput, cand: string, jobText: string): {
  points: number;
  detail: string;
  verify: string[];
} {
  const verify: string[] = [];
  const candLoc = String(candidate.location || "").toLowerCase();
  const jobLoc = String(job.location || "").toLowerCase();
  const remote = /\b(remote|hybrid|work from home)\b/i.test(jobText);
  const onsite = /\b(on[- ]site|in[- ]office|must be local)\b/i.test(jobText) && !remote;

  if (remote) {
    return { points: 14, detail: "Role is remote/hybrid — location weighted lightly", verify };
  }

  const candTokens = candLoc.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const jobTokens = jobLoc.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const overlap = candTokens.filter((t) => jobTokens.includes(t) && !["united", "states"].includes(t));

  const flPair =
    /\b(weston|fort lauderdale|ft lauderdale|miami|hollywood|davie|plantation|sunrise|pembroke|boca)\b/i.test(
      candLoc
    ) && /\b(fort lauderdale|ft lauderdale|miami|broward|weston)\b/i.test(jobLoc + " " + jobText);

  if (overlap.length >= 1 || flPair) {
    return {
      points: flPair || overlap.includes("atlanta") || overlap.includes("lauderdale") ? 14 : 13,
      detail: `Local / metro-adjacent (${candidate.location || "profile"} ↔ ${job.location || "role"})`,
      verify,
    };
  }

  if (!candLoc) {
    verify.push("Confirm candidate location and willingness to work the required site");
    return { points: 10, detail: "Location not stated — treated as a question, not a deduction", verify };
  }

  if (onsite) {
    verify.push("On-site role and candidate is non-local — confirm relocation before assuming they will not move");
    return { points: 8, detail: "Non-local for an on-site role; relocation not stated", verify };
  }

  return { points: 11, detail: "Location workable; confirm commute/relocation", verify };
}

function hardGates(jobText: string, cand: string, candidate: FitCandidateInput, job: FitJobInput, locPts: number): FitHardGate[] {
  const gates: FitHardGate[] = [];

  const jdRequiresAuth =
    /\b(authorized to work|work authorization|no (visa )?sponsorship|must be (eligible|authorized) to work)\b/i.test(
      jobText
    );
  const candNeedsSponsorship =
    /\b(will (require|need) sponsorship|requires? sponsorship|sponsorship required)\b/i.test(cand);
  if (jdRequiresAuth && candNeedsSponsorship) {
    gates.push({
      id: "work_authorization",
      label: "Work authorization",
      passed: false,
      cap: 40,
      detail: "JD requires US work authorization; profile signals sponsorship is needed",
    });
  } else {
    gates.push({
      id: "work_authorization",
      label: "Work authorization",
      passed: true,
      detail: "No work-authorization conflict shown",
    });
  }

  const license =
    /\b(p\.?e\.?\s*stamp|professional engineer license|rn license|cdl\b|bar admission)\b/i.test(jobText) &&
    !/preferred|nice to have|a plus/i.test(jobText);
  const evidenced = /\b(p\.?e\.?|professional engineer|registered nurse|\bcdl\b|admitted to the bar)\b/i.test(cand);
  if (license && !evidenced) {
    gates.push({
      id: "required_license",
      label: "Required license / cert",
      passed: false,
      cap: 55,
      detail: "JD lists a legally required license that is not evidenced",
    });
  } else {
    gates.push({
      id: "required_license",
      label: "Required license / cert",
      passed: true,
      detail: "No unmet legally required license",
    });
  }

  const remote = /\b(remote|hybrid)\b/i.test(jobText);
  const hardOnsite =
    /\b(on[- ]site|must be local|local candidates only|no remote)\b/i.test(jobText) && !remote;
  const reloc = /\b(relocat|willing to move|open to move)\b/i.test(cand);
  if (hardOnsite && locPts <= 6 && !reloc) {
    gates.push({
      id: "hard_location",
      label: "Hard location constraint",
      passed: false,
      cap: 70,
      detail: "On-site role and candidate is non-local with no relocation signal",
    });
  } else {
    gates.push({
      id: "hard_location",
      label: "Hard location constraint",
      passed: true,
      detail: "No hard location fail",
    });
  }

  return gates;
}

function defaultHm(score: number, exp: number, industry: number): { hm: HmReachOut; reason: string } {
  if (exp >= 28 && industry >= 18 && score >= 80) {
    return {
      hm: "Yes",
      reason: "A hiring manager would reach out — demonstrated ops leadership in the same industry, local, and clearly able to do the work.",
    };
  }
  if (exp >= 20 && score >= 70) {
    return {
      hm: "Maybe",
      reason: "Worth a look; a few verifications before treating as a slam dunk.",
    };
  }
  return {
    hm: "No",
    reason: "On paper this would not jump off the pile without more context.",
  };
}

export function scoreCandidateJobFitV3(
  candidate: FitCandidateInput,
  job: FitJobInput
): FitScoreV3 {
  const cand = blob(candidate);
  const jobText = jobBlob(job);

  const exp = scoreExperience(cand, jobText, candidate);
  const industry = scoreIndustry(cand, jobText);
  const skills = scoreSkills(cand, jobText);
  const location = scoreLocation(candidate, job, cand, jobText);

  const rubric: FitRubricFactor[] = [
    { id: "experience", label: "Relevant Experience / Can-Do", points: exp.points, max: 35, detail: exp.detail },
    { id: "industry", label: "Industry Alignment", points: industry.points, max: 25, detail: industry.detail },
    { id: "skills", label: "Software / Skills / Certs", points: skills.points, max: 25, detail: skills.detail },
    { id: "location", label: "Location & Logistics", points: location.points, max: 15, detail: location.detail },
  ];

  let score = rubric.reduce((s, f) => s + f.points, 0);
  const gates = hardGates(jobText, cand, candidate, job, location.points);
  for (const g of gates) {
    if (!g.passed && typeof g.cap === "number") score = Math.min(score, g.cap);
  }
  score = clamp(score, 1, 100);

  const { hm, reason } = defaultHm(score, exp.points, industry.points);

  const band = bandFromScore(score);
  const grade = gradeFromBand(score);
  const verify = Array.from(
    new Set([...exp.verify, ...industry.verify, ...skills.verify, ...location.verify])
  ).slice(0, 6);

  const strengths: string[] = [];
  const gaps: string[] = [];
  for (const f of rubric) {
    const pct = f.max ? f.points / f.max : 0;
    if (pct >= 0.75) strengths.push(`${f.label} ${f.points}/${f.max} — ${f.detail}`);
    else if (pct < 0.5) gaps.push(`${f.label} ${f.points}/${f.max} — ${f.detail}`);
  }
  if (hm === "Yes") strengths.unshift("Hiring manager would reach out on this resume");

  const domainFit: FitSplitScore = {
    score: clamp((industry.points / 25) * 100, 0, 100),
    grade: gradeFromBand(clamp((industry.points / 25) * 100, 0, 100)),
    applicable: true,
  };
  const toolReadiness: FitSplitScore = {
    score: clamp((skills.points / 25) * 100, 0, 100),
    grade: gradeFromBand(clamp((skills.points / 25) * 100, 0, 100)),
    applicable: true,
  };

  return {
    score,
    grade,
    band,
    hmReachOut: hm,
    hmReason: reason,
    domainFit,
    toolReadiness,
    dimensions: [],
    reasons: [
      `COMPOSITE ${score}/100 — ${band}`,
      `${rubric[0].label}: ${exp.points}/35 — ${exp.detail}`,
      `${rubric[1].label}: ${industry.points}/25 — ${industry.detail}`,
      `${rubric[2].label}: ${skills.points}/25 — ${skills.detail}`,
      `${rubric[3].label}: ${location.points}/15 — ${location.detail}`,
      `WOULD A HIRING MANAGER REACH OUT? ${hm} — ${reason}`,
    ],
    strengths: strengths.slice(0, 8),
    gaps: gaps.slice(0, 6),
    skillsMatched: skills.matched,
    skillsMissing: skills.missing,
    toolsMatched: skills.matched,
    toolsMissing: skills.missing,
    scoringVersion: "v3",
    rubric,
    gates,
    verifyBeforeAdvancing: verify,
  };
}
