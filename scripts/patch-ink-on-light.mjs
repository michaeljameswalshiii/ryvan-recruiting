import fs from "fs";

const files = [
  "src/app/dashboard/jobs/[id]/page.tsx",
  "src/components/candidate/CandidateDetailClient.tsx",
  "src/components/desk/DeskNextActions.tsx",
  "src/app/dashboard/companies/[id]/page.tsx",
  "src/components/job/JobHiringManagerCard.tsx",
  "src/components/job/JobActivityNotes.tsx",
];

for (const p of files) {
  if (!fs.existsSync(p)) {
    console.log("skip missing", p);
    continue;
  }
  let s = fs.readFileSync(p, "utf8");
  const before = s;

  // Tag common light cards
  s = s.replace(
    /className="((?:[^"]*\s)?)(bg-white border[^"]*rounded-2xl)/g,
    (m, pre, rest) =>
      m.includes("data-ink-on-light")
        ? m
        : `data-ink-on-light className="${pre}${rest}`
  );
  s = s.replace(
    /className="((?:[^"]*\s)?)(bg-white border[^"]*rounded-xl)/g,
    (m, pre, rest) =>
      m.includes("data-ink-on-light")
        ? m
        : `data-ink-on-light className="${pre}${rest}`
  );
  s = s.replace(
    /className="((?:[^"]*\s)?)(rounded-2xl border border-border bg-card)/g,
    (m, pre, rest) =>
      m.includes("data-ink-on-light")
        ? m
        : `data-ink-on-light className="${pre}${rest}`
  );
  s = s.replace(
    /className=\{`([^`]*bg-amber-50[^`]*)`\}/g,
    (m, inner) =>
      m.includes("data-ink-on-light")
        ? m
        : `data-ink-on-light className={\`${inner}\`}`
  );

  // Dedup
  s = s.replace(/data-ink-on-light data-ink-on-light/g, "data-ink-on-light");

  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log("updated", p);
  } else {
    console.log("no change", p);
  }
}
