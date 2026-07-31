import { scoreCandidateJobFit, buildReviewerAssessment } from "../src/lib/ai/fit-score";

const candidate = {
  title: "Senior Accountant",
  summary:
    "Experienced finance professional with 8 years in accounting operations, QuickBooks, general ledger, month-end close, AP/AR, and financial reporting.",
  skills: [
    "quickbooks",
    "general ledger",
    "month-end close",
    "accounts payable",
    "accounts receivable",
    "financial reporting",
  ],
  location: "Austin, TX",
  experience: [
    {
      title: "Senior Accountant",
      company: "Acme Financial",
      description:
        "Managed month-end close, reconciliations, AP/AR, and reporting for a multi-entity nonprofit environment.",
    },
  ],
};

const job = {
  title: "Senior Accountant",
  description:
    "Seeking a Senior Accountant with QuickBooks, general ledger, month-end close, AP/AR, and financial reporting experience for a nonprofit finance team.",
  location: "Austin, TX",
  salaryRange: "$75k - $95k",
};

const result = scoreCandidateJobFit(candidate, job);
const assessment = buildReviewerAssessment(result);

console.log(JSON.stringify(assessment, null, 2));

const checks = [
  ["headline_present", Boolean(assessment.headline)],
  ["summary_present", Boolean(assessment.summary)],
  ["high_confidence", assessment.confidence === "high"],
  ["matched_skills_present", assessment.matchedSkills.length >= 3],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
  if (!ok) failed++;
}

process.exit(failed ? 1 : 0);
