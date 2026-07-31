import { scoreCandidateJobFit, formatFitSummary } from "../src/lib/ai/fit-score";

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
console.log(JSON.stringify(result, null, 2));
console.log("\n--- Summary ---\n");
console.log(formatFitSummary(result));

const checks = [
  ["score_is_reasonable", result.score >= 70],
  ["has_strengths", result.strengths.length >= 1],
  ["has_gaps_or_reasons", result.reasons.length >= 1],
  ["skills_matched", result.skillsMatched.length >= 3],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
  if (!ok) failed++;
}

process.exit(failed ? 1 : 0);
