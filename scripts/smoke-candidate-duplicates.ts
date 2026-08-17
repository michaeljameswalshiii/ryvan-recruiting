import {
  compareIncomingToExisting,
  countWorkHistoryOverlap,
  findDuplicateMatches,
  jobsAlign,
  normalizeOrg,
  orgsMatch,
} from "../src/lib/candidates/duplicates";

let failed = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log((cond ? "OK  " : "FAIL") + ` ${name}: ${detail}`);
  if (!cond) failed += 1;
}

const incomingMary = {
  name: "Mary Prosper",
  email: "mary.prosper@gmail.com",
  phone: "3055550100",
  title: "Auditor",
  source: "resume",
  resume_file_name: "Mary Prosper resume.pdf",
  experience: [
    { company: "Auditor Partners", title: "Auditor", dates: "2022–2026" },
    { company: "Hickory & Co.", title: "Staff Auditor", dates: "2018–2022" },
    { company: "Parent Corp.", title: "Intern", dates: "2018" },
    { company: "Ridgeway", title: "Clerk", dates: "2016–2018" },
    { company: "Lakeside CPA", title: "Seasonal", dates: "2015–2016" },
    { company: "Harbor Tax", title: "Prep", dates: "2015" },
  ],
  education: [
    { school: "Palm Beach State College", dates: "2015" },
  ],
};

const existingMary = {
  id: "cand-mary",
  name: "Mary Prosper",
  email: "MaryProsper@outlook.com",
  phone: "(562) 993-0542",
  title: "Auditor",
  resume_file_name: "Mary-Prosper-2026-03.pdf",
  modified_at: "2026-03-03T12:00:00.000Z",
  experience: [
    { company: "Auditor Partners", title: "Auditor", dates: "2022–2026" },
    { company: "Hickory & Co. Parent Corp.", title: "Staff Auditor", dates: "2018–2022" },
    { company: "Parent Corp.", title: "Intern", dates: "2018" },
    { company: "Ridgeway", title: "Clerk", dates: "2016–2018" },
    { company: "Lakeside CPA", title: "Seasonal", dates: "2015–2016" },
    { company: "Harbor Tax", title: "Prep", dates: "2015" },
  ],
  education: [{ school: "Palm Beach State College", dates: "2015" }],
};

check(
  "org_suffix",
  orgsMatch("Hickory & Co. Parent Corp.", "Hickory and Co Parent"),
  "corp/and suffixes collapse"
);

check(
  "jobs_align_year_slack",
  jobsAlign(
    { company: "Auditor Partners", dates: "2018-2026" },
    { company: "Auditor Partners Inc", dates: "2018 – Present" }
  ),
  "same employer + overlapping dates"
);

const overlap = countWorkHistoryOverlap(
  incomingMary.experience,
  existingMary.experience
);
check(
  "six_of_six",
  overlap.matched === 6 && overlap.incomingTotal === 6,
  `${overlap.matched} of ${overlap.incomingTotal}`
);

const match = compareIncomingToExisting(incomingMary, existingMary);
check("found_match", Boolean(match), match?.headline || "no match");
check(
  "high_confidence",
  match?.confidence === "high",
  match?.confidence || "missing"
);
check(
  "contact_differs",
  match?.contactDiffers === true,
  "different email/phone still matches on history"
);
check(
  "work_and_name_headline",
  Boolean(match?.headline.toLowerCase().includes("work history")),
  match?.headline || ""
);
check(
  "education_highlight",
  match?.existing.highlightEducation === true &&
    match?.incoming.highlightEducation === true,
  "school rows highlighted"
);

const emailOnly = compareIncomingToExisting(
  { name: "Alex Rivera", email: "alex@example.com" },
  { id: "a1", name: "A. Rivera", email: "alex@example.com" }
);
check("email_match", Boolean(emailOnly), "email is enough even if name differs");

const nameOnly = compareIncomingToExisting(
  { name: "John Smith", title: "Analyst" },
  { id: "js", name: "John Smith", title: "Chef" }
);
check(
  "name_only_rejected",
  nameOnly === null,
  "common name without corroboration is not a duplicate"
);

const namePlusEduTitle = compareIncomingToExisting(
  {
    name: "Priya Shah",
    title: "Controller",
    education: [{ school: "University of Florida", dates: "2012" }],
  },
  {
    id: "ps",
    name: "Priya Shah",
    title: "Controller",
    education: [{ school: "University of Florida", dates: "2012" }],
  }
);
check(
  "name_edu_title",
  Boolean(namePlusEduTitle),
  "name + school + title is enough"
);

const ranked = findDuplicateMatches(incomingMary, [
  existingMary,
  { id: "other", name: "Sam Lee", email: "sam@x.com" },
]);
check("ranks_best", ranked[0]?.candidateId === "cand-mary", ranked[0]?.candidateId || "none");
check("normalize_co", normalizeOrg("The Acme Company, LLC") === "acme", normalizeOrg("The Acme Company, LLC"));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll duplicate-detection checks passed");
