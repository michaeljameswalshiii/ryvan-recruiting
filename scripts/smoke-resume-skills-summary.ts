import { parseResumeText } from "../src/lib/candidates/resume-text-parser";
import { mapParsedResumeToForm } from "../src/lib/candidates/resume-parse-client";

const christinia = `CHRISTINIA BRAMBLE
SENIOR PROJECT MANAGER
Atlanta, GA
christinia@email.com
(404) 555-0100

PROFESSIONAL SUMMARY
Senior Project Manager with 12 years leading commercial construction projects
from preconstruction through closeout. Experienced in scheduling, budgeting,
and job site operations.

SKILLS
Project Management, Construction Management, Scheduling, Budgeting, Procore, Bluebeam

EXPERIENCE
Senior Project Manager
BuildCore - Atlanta, Ga
Spring 2018 - Present
• Managed commercial construction projects and change orders
• Coordinated subcontractors and RFIs on active job sites
`;

const noSkillsSection = `CHRISTINIA BRAMBLE
SENIOR PROJECT MANAGER
Atlanta, GA
christinia@email.com

PROFESSIONAL SUMMARY
Senior Project Manager in commercial construction.

EXPERIENCE
Senior Project Manager
BuildCore
Spring 2018 - Present
• Managed construction projects, scheduling, and budgeting
`;

const software = `Alex Chen
Software Engineer
Seattle, WA
alex@email.com

SKILLS
Java, Spring Boot, React, AWS

EXPERIENCE
Software Engineer
Acme
2020 - Present
• Built Spring Boot APIs
`;

let failed = 0;

function check(name: string, cond: boolean, detail: string) {
  console.log((cond ? "OK  " : "FAIL") + ` ${name}: ${detail}`);
  if (!cond) failed += 1;
}

const c = parseResumeText(christinia, { filename: "CHRISTINIA-BRAMBLE-resume.pdf" });
const cm = mapParsedResumeToForm(c);
const cSkills = (cm.skills || "").toLowerCase();
const cSummary = (cm.summary || "").toLowerCase();
const cTags = (cm.tags || "").toLowerCase();

check(
  "no_spring_skill",
  !/\bspring\b/.test(cSkills),
  `skills=${JSON.stringify(cm.skills)}`
);
check(
  "no_spring_summary",
  !/\bspring\b/.test(cSummary),
  `summary=${JSON.stringify(cm.summary)}`
);
check(
  "has_pm_skill",
  /project management|scheduling|procore|budgeting|construction/i.test(cSkills),
  `skills=${JSON.stringify(cm.skills)}`
);
check(
  "tags_construction_pm",
  /construction/.test(cTags) && /project manage/.test(cTags),
  `tags=${JSON.stringify(cm.tags)}`
);
check(
  "summary_has_title",
  /project manager/i.test(cm.summary || ""),
  `summary=${JSON.stringify(cm.summary)}`
);

const n = parseResumeText(noSkillsSection);
const nm = mapParsedResumeToForm(n);
check(
  "no_skills_section_no_spring",
  !/\bspring\b/i.test(`${nm.skills} ${nm.summary}`),
  `skills=${JSON.stringify(nm.skills)} summary=${JSON.stringify(nm.summary)} tags=${JSON.stringify(nm.tags)}`
);
check(
  "no_skills_section_tags",
  /construction/i.test(nm.tags || "") && /project manage/i.test(nm.tags || ""),
  `tags=${JSON.stringify(nm.tags)}`
);

const s = parseResumeText(software);
const sm = mapParsedResumeToForm(s);
check(
  "keeps_spring_boot",
  /spring boot/i.test(sm.skills || ""),
  `skills=${JSON.stringify(sm.skills)}`
);

process.exit(failed ? 1 : 0);
