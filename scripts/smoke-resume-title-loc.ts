import {
  parseResumeText,
  sanitizeCandidateLocation,
  sanitizeCandidatePhone,
} from "../src/lib/candidates/resume-text-parser";
import { mapParsedResumeToForm } from "../src/lib/candidates/resume-parse-client";

const samples = [
  {
    name: "header_title_loc",
    text: `Catherine Carter
Software Engineer
Miami, FL
catherine@email.com
(305) 555-0100

PROFESSIONAL SUMMARY
Experienced Software Engineer with 8 years building web apps.

EXPERIENCE
Senior Software Engineer
Acme Corp
Jan 2020 - Present
• Built APIs
`,
  },
  {
    name: "one_line_no_comma",
    text: `Jane Doe | Product Manager | Tampa FL | jane@x.com | 555-123-4567

EXPERIENCE
Product Manager at Beta Inc
2021 - Present
• Roadmaps
`,
  },
  {
    name: "exp_fallback",
    text: `John Smith
john@x.com

WORK EXPERIENCE
Accounting Manager
ABC Company | Dallas, TX
2019 - Present
• Led close
`,
  },
  {
    name: "indeed_header_blob",
    text: `Mary Prosper
Accounting Associate
maryp718@gmail.com
gmail.com Mary Prosper Greenacres, FL
(555) 123-4567

WORK EXPERIENCE
Accounting Associate
Local Firm
2020 - Present
• Reconciled accounts
`,
  },
];

let failed = 0;
for (const s of samples) {
  const p = parseResumeText(s.text, { filename: "Catherine-Carter-resume.pdf" });
  const m = mapParsedResumeToForm(p);
  const ok = Boolean(m.title && m.location);
  console.log(
    (ok ? "OK  " : "FAIL") +
      ` ${s.name}: title=${JSON.stringify(m.title)} location=${JSON.stringify(m.location)} name=${JSON.stringify(m.name)}`
  );
  if (!ok) failed++;
}

const indeed = parseResumeText(
  `Mary Prosper
Accounting Associate
maryp718@gmail.com
gmail.com Mary Prosper Greenacres, FL
(555) 123-4567

WORK EXPERIENCE
Accounting Associate
Local Firm
2020 - Present
• Reconciled accounts
`,
  { filename: "Mary-Prosper-resume.pdf" }
);
const indeedForm = mapParsedResumeToForm(indeed);
console.log(
  (indeedForm.location === "Greenacres, FL" ? "OK  " : "FAIL") +
    ` indeed_location: ${JSON.stringify(indeedForm.location)}`
);
if (indeedForm.location !== "Greenacres, FL") failed++;
console.log(
  (indeedForm.phone === "" ? "OK  " : "FAIL") +
    ` indeed_phone_blank: ${JSON.stringify(indeedForm.phone)}`
);
if (indeedForm.phone !== "") failed++;
console.log(
  (indeedForm.email === "maryp718@gmail.com" ? "OK  " : "FAIL") +
    ` indeed_email: ${JSON.stringify(indeedForm.email)}`
);
if (indeedForm.email !== "maryp718@gmail.com") failed++;

const locCheck =
  sanitizeCandidateLocation(
    "gmail.com Mary Prosper Greenacres, FL",
    "Mary Prosper"
  ) === "Greenacres, FL";
console.log(
  (locCheck ? "OK  " : "FAIL") +
    ` sanitize_indeed_loc: ${JSON.stringify(
      sanitizeCandidateLocation(
        "gmail.com Mary Prosper Greenacres, FL",
        "Mary Prosper"
      )
    )}`
);
if (!locCheck) failed++;

const westPalm = sanitizeCandidateLocation("West Palm Beach, FL");
console.log(
  (westPalm === "West Palm Beach, FL" ? "OK  " : "FAIL") +
    ` keep_west_palm: ${JSON.stringify(westPalm)}`
);
if (westPalm !== "West Palm Beach, FL") failed++;

console.log(
  (sanitizeCandidatePhone("(555) 123-4567") === "" ? "OK  " : "FAIL") +
    " placeholder_555"
);
if (sanitizeCandidatePhone("(555) 123-4567") !== "") failed++;
console.log(
  (sanitizeCandidatePhone("(305) 696-0248") === "(305) 696-0248" ? "OK  " : "FAIL") +
    " keep_real_phone"
);
if (sanitizeCandidatePhone("(305) 696-0248") !== "(305) 696-0248") failed++;

process.exit(failed ? 1 : 0);
