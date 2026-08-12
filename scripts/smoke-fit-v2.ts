/**
 * Fit Score V2 smoke: same-field stay high, cross-field drop hard, V1 still callable.
 */
import {
  scoreCandidateJobFit,
  scoreCandidateJobFitV1,
  formatFitSummary,
} from "../src/lib/ai/fit-score";

const accountant = {
  title: "Staff Accountant",
  summary:
    "Accountant with 8 years of month-end close, journal entries, AP/AR, Excel, budgeting, and vendor coordination.",
  skills: [
    "accounting",
    "excel",
    "budgeting",
    "accounts payable",
    "general ledger",
    "month-end close",
    "project management",
  ],
  location: "Dallas, TX",
  experience: [
    {
      title: "Staff Accountant",
      company: "Metro CPA Group",
      dates: "2018-2026",
      description:
        "Month-end close, reconciliations, budgets, Excel reporting, and coordinating with department managers.",
    },
  ],
};

const constructionPm = {
  title: "Construction Project Manager",
  summary:
    "GC project manager with 10 years of commercial ground-up work. Owns RFIs, submittals, change orders, Procore, schedules, and closeout.",
  skills: ["procore", "bluebeam", "scheduling", "change orders", "submittals"],
  location: "Dallas, TX",
  experience: [
    {
      title: "Project Manager",
      company: "Summit General Contractors",
      dates: "2016-2026",
      description:
        "Managed commercial ground-up and TI projects. RFIs, submittals, change orders, Procore, Bluebeam, superintendent coordination, punch list and closeout.",
    },
  ],
};

const constructionJd = {
  title: "Construction Project Manager",
  description: `
On-site Construction Project Manager for a commercial general contractor.
Must own RFIs, submittals, change orders, budgets/cost control, scheduling, GC/client coordination, and closeout.
Procore and Bluebeam required. OSHA 30 a plus.
Location: Dallas, TX. On-site, local candidates preferred.
`,
  location: "Dallas, TX",
};

const accountantJd = {
  title: "Staff Accountant",
  description:
    "Staff Accountant for month-end close, journal entries, AP/AR, general ledger, and financial reporting. QuickBooks and Excel.",
  location: "Dallas, TX",
};

const sameField = scoreCandidateJobFit(constructionPm, constructionJd);
const crossField = scoreCandidateJobFit(accountant, constructionJd);
const accountantFit = scoreCandidateJobFit(accountant, accountantJd);
const v1Cross = scoreCandidateJobFitV1(accountant, constructionJd);

console.log("=== Construction PM vs construction JD (same field) ===");
console.log(
  JSON.stringify(
    {
      score: sameField.score,
      grade: sameField.grade,
      version: sameField.scoringVersion,
      v1: sameField.v1Score,
      rubric: sameField.v2RubricScore,
      field: sameField.fieldFit?.alignment,
    },
    null,
    2
  )
);

console.log("\n=== Accountant vs construction PM JD (field mismatch) ===");
console.log(
  JSON.stringify(
    {
      score: crossField.score,
      grade: crossField.grade,
      version: crossField.scoringVersion,
      v1: crossField.v1Score,
      rubric: crossField.v2RubricScore,
      field: crossField.fieldFit,
    },
    null,
    2
  )
);
console.log("\n--- Cross-field summary ---\n");
console.log(formatFitSummary(crossField));

console.log("\n=== Accountant vs accountant JD ===");
console.log({
  score: accountantFit.score,
  field: accountantFit.fieldFit?.alignment,
});

const checks: Array<[string, boolean]> = [
  ["v2_is_live", sameField.scoringVersion === "v2"],
  ["v1_still_callable", v1Cross.scoringVersion === "v1"],
  ["same_field_stays_strong", sameField.score >= 70],
  ["same_field_alignment", sameField.fieldFit?.alignment === "same"],
  ["accountant_same_field", accountantFit.score >= 70],
  ["cross_field_unrelated", crossField.fieldFit?.alignment === "unrelated"],
  ["cross_field_significantly_lower", crossField.score <= 48],
  ["cross_field_below_v1", crossField.score < v1Cross.score],
  ["cross_field_below_same_field", crossField.score + 20 <= sameField.score],
  ["blend_metadata", sameField.v1Score != null && sameField.v2RubricScore != null],
];

let failed = 0;
console.log("\n=== Checks ===");
for (const [name, ok] of checks) {
  console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
  if (!ok) failed += 1;
}

process.exit(failed ? 1 : 0);
