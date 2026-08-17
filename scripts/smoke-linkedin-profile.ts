import fs from "fs";
import {
  extractLinkedIn,
  normalizeLinkedInUrl,
  parseResumeText,
  scrapeLinkedInUrlsFromPdfBytes,
} from "../src/lib/candidates/resume-text-parser";

let failed = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log((cond ? "OK  " : "FAIL") + ` ${name}: ${detail}`);
  if (!cond) failed += 1;
}

const easyApplyWrapped = `Contact
www.linkedin.com/in/
raunykhandaker (LinkedIn)
Top Skills
Event Management
Rani Khandaker
Project Manager
Atlanta, Georgia, United States
Summary
I am a Project Manager for steel fabrication.
`;

check(
  "wrap_after_in",
  extractLinkedIn(easyApplyWrapped) ===
    "https://www.linkedin.com/in/raunykhandaker",
  extractLinkedIn(easyApplyWrapped)
);

check(
  "hyphen_wrap",
  extractLinkedIn("linkedin.com/in/jane-\ndoe-1234 (LinkedIn)") ===
    "https://www.linkedin.com/in/jane-doe-1234",
  extractLinkedIn("linkedin.com/in/jane-\ndoe-1234 (LinkedIn)")
);

check(
  "no_eat_next_heading",
  extractLinkedIn(
    "https://www.linkedin.com/in/raunykhandaker\nContact\nwww.linkedin.com/in/\nraunykhandaker (LinkedIn)"
  ) === "https://www.linkedin.com/in/raunykhandaker",
  extractLinkedIn(
    "https://www.linkedin.com/in/raunykhandaker\nContact\nwww.linkedin.com/in/\nraunykhandaker (LinkedIn)"
  )
);

check(
  "country_host",
  normalizeLinkedInUrl("https://uk.linkedin.com/in/sam-lee") ===
    "https://www.linkedin.com/in/sam-lee",
  normalizeLinkedInUrl("https://uk.linkedin.com/in/sam-lee")
);

check(
  "strip_easy_apply_query",
  normalizeLinkedInUrl(
    "https://www.linkedin.com/in/raunykhandaker?jobid=1234&lipi=urn%3Ali%3Apage"
  ) === "https://www.linkedin.com/in/raunykhandaker",
  "query stripped"
);

const parsed = parseResumeText(easyApplyWrapped, {
  filename: "Profile.pdf",
});
check("parse_sets_linkedin", parsed.linkedin.includes("raunykhandaker"), parsed.linkedin);
check("parse_keeps_name", /rani/i.test(parsed.name), parsed.name);

const fakePdf = Buffer.from(
  `%PDF-1.4\n7 0 obj\n<< /URI (https://www.linkedin.com/in/raunykhandaker?jobid=1234&lipi=x) >>\nendobj\n`,
  "latin1"
);
check(
  "uri_annotation",
  scrapeLinkedInUrlsFromPdfBytes(fakePdf)[0] ===
    "https://www.linkedin.com/in/raunykhandaker",
  String(scrapeLinkedInUrlsFromPdfBytes(fakePdf)[0] || "")
);

async function checkRealPdf() {
  const realPath =
    process.argv[2] || String.raw`C:\Users\micha\Downloads\Profile (20).pdf`;
  if (!fs.existsSync(realPath)) return;
  const { parseResumeBuffer } = await import(
    "../src/lib/candidates/resume-extract-server"
  );
  const { parsed: fromPdf } = await parseResumeBuffer(
    fs.readFileSync(realPath),
    "Profile (20).pdf"
  );
  check(
    "real_pdf",
    fromPdf.linkedin === "https://www.linkedin.com/in/raunykhandaker",
    fromPdf.linkedin || "(empty)"
  );
}

checkRealPdf()
  .then(() => {
    if (failed) {
      console.error(`\n${failed} check(s) failed`);
      process.exit(1);
    }
    console.log("\nAll LinkedIn profile URL smoke checks passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
