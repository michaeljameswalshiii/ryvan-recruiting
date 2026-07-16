// Quick smoke test for resume-text-parser (run via: npx tsx scripts/smoke-resume-parse.mjs)
import { parseResumeText } from '../src/lib/candidates/resume-text-parser.ts';

const sample = `
JANE A. DOE
Senior Software Engineer
San Francisco, CA | jane.doe@email.com | (415) 555-1234
linkedin.com/in/janedoe

PROFESSIONAL SUMMARY
Full-stack engineer with 8 years building cloud products.

EXPERIENCE
Acme Corp
Senior Software Engineer
Jan 2020 - Present
• Led React and Node platform modernization
• Owned AWS infrastructure and CI/CD

Beta LLC | Software Engineer | 2016 - 2019
• Built APIs and data pipelines

EDUCATION
University of California, Berkeley
B.S. Computer Science
2012 - 2016

SKILLS
TypeScript, React, Node.js, AWS, Docker, Kubernetes, PostgreSQL

CERTIFICATIONS
AWS Solutions Architect Associate
`;

const r = parseResumeText(sample, { filename: 'Jane_Doe_Resume.pdf' });
console.log(JSON.stringify(r, null, 2));

const checks = [
  ['name', r.name.toLowerCase().includes('jane')],
  ['email', r.email.includes('jane.doe')],
  ['phone', r.phone.includes('415')],
  ['title', /engineer/i.test(r.title)],
  ['location', /francisco/i.test(r.location)],
  ['skills', r.skills.length >= 3],
  ['experience', r.experience.length >= 1],
  ['education', r.education.length >= 1],
  ['summary', r.summary.length > 10],
  ['linkedin', /linkedin/i.test(r.linkedin)],
];

let failed = 0;
for (const [k, ok] of checks) {
  console.log(ok ? `OK  ${k}` : `FAIL ${k}`, '→', r[k] ?? '');
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
