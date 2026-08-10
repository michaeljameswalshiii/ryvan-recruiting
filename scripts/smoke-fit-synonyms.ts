/**
 * Smoke: synonym / transferable skill matching (Ashira-style resume language).
 */
import {
  scoreCandidateJobFit,
  skillMatchCredit,
  extractSkillsFromText,
} from "../src/lib/ai/fit-score";

const ashiraText = `
Ashira Peress Boca Raton FL Manager Crumbl Cookies Oversee daily store operations
Lead and coordinate the crew opening and closing product preparation
Shift Leader Dunkin Delivered friendly efficient service Led and supervised crew
Logged and recorded product temperatures manager book Promoted from crew member
Receptionist scheduling entering information into computer systems Built websites
Data Entry Specialist logged and entered every lead company system daily goal of 200 leads
KEY SKILLS Team Leadership Customer Service Multitasking Data Entry
`;

const cand = {
  title: "Manager",
  summary:
    "Reliable customer-focused team leader with over 15 years of experience across retail, food service, and administrative settings.",
  skills: [
    "Team Leadership & Crew Supervision",
    "Customer Service & Conflict Resolution",
    "Data Entry & Organization",
    "Multitasking & Time Management",
  ],
  experience: [
    {
      title: "Manager",
      company: "Crumbl",
      description:
        "Oversee daily store operations, lead crew, opening and closing, product preparation.",
    },
    {
      title: "Shift Leader",
      company: "Dunkin",
      description:
        "Led crew, logged product temperatures in manager book, promoted from crew, customer orders.",
    },
    {
      title: "Receptionist",
      company: "Boca Fertility",
      description:
        "Scheduling, entering information into computer systems, built websites.",
    },
    {
      title: "Data Entry Specialist",
      company: "Web Net",
      description:
        "Logged and entered every lead into company system, daily goal of 200 leads.",
    },
  ],
  location: "Boca Raton, FL",
};

const job = {
  title: "Operations / Administrative Manager",
  description:
    "Looking for a leader with POS experience, CRM or customer databases, Microsoft Office or computer systems, scheduling, data entry, inventory awareness, customer service, and team leadership. Retail or food service experience a plus.",
  location: "Boca Raton, FL",
};

const blob = [
  cand.summary,
  ...cand.skills,
  ...cand.experience.map((e) => e.description),
  ashiraText,
].join("\n");

const extracted = extractSkillsFromText(blob);
console.log("extracted skills:", extracted);

const tools = [
  "pos",
  "crm",
  "microsoft office",
  "scheduling",
  "data entry",
  "excel",
  "inventory",
  "customer service",
  "leadership",
];
for (const tool of tools) {
  const m = skillMatchCredit(tool, [...cand.skills, ...extracted], blob);
  console.log(
    `${tool.padEnd(18)} credit=${m.credit.toFixed(2)} via=${m.matchedAs || "-"}`
  );
}

const result = scoreCandidateJobFit(cand, job);
const skillsDim = result.dimensions.find((d) => d.id === "skills_match");
const ach = result.dimensions.find((d) => d.id === "achievements");

console.log(
  JSON.stringify(
    {
      score: result.score,
      skills: skillsDim,
      achievements: ach,
      toolsMatched: result.toolsMatched,
      toolsMissing: result.toolsMissing,
      skillsExact: result.skillsExactCount,
      skillsAdj: result.skillsAdjacentCount,
      toolReadiness: result.toolReadiness,
    },
    null,
    2
  )
);

const checks: Array<[string, boolean]> = [
  ["pos_matched", skillMatchCredit("pos", extracted, blob).credit >= 0.5],
  ["crm_matched", skillMatchCredit("crm", extracted, blob).credit >= 0.5],
  [
    "ms_office_matched",
    skillMatchCredit("microsoft office", extracted, blob).credit >= 0.5,
  ],
  [
    "data_entry_matched",
    skillMatchCredit("data entry", extracted, blob).credit >= 0.5,
  ],
  [
    "tools_not_zero",
    (result.toolReadiness?.score ?? 0) > 20,
  ],
  [
    "has_adjacent",
    (result.skillsAdjacentCount ?? 0) + (result.skillsExactCount ?? 0) >= 2,
  ],
  [
    "achievements_metric",
    (ach?.detail || "").includes("metric-like") &&
      !ach!.detail.includes("(0 metric-like"),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
