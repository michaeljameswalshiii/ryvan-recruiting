import { parseResumeText } from "../src/lib/candidates/resume-text-parser";
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
process.exit(failed ? 1 : 0);
