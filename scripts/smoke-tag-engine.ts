import {
  classifyText,
  matchControlledTags,
  recordMatchesQuery,
  tagsFromRecord,
} from "../src/lib/tags";

let failed = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log((cond ? "OK  " : "FAIL") + ` ${name}: ${detail}`);
  if (!cond) failed += 1;
}

const resume = classifyText({
  objectType: "candidate",
  title: "Director of Operations",
  text: `Managed a 55-person precision manufacturing operation serving aerospace, defense and medical device customers. Experience with CNC machining, ISO 13485, AS9100 and lean manufacturing.`,
});

check(
  "cnc",
  resume.tags.includes("CNC"),
  `tags=${resume.tags.join(", ")}`
);
check(
  "aero",
  resume.tags.includes("Aerospace"),
  `tags=${resume.tags.join(", ")}`
);
check(
  "as9100",
  resume.tags.includes("AS9100"),
  `tags=${resume.tags.join(", ")}`
);
check(
  "no_spring",
  !resume.tags.some((t) => /^spring$/i.test(t)),
  `tags=${resume.tags.join(", ")}`
);

const job = tagsFromRecord({
  objectType: "job",
  title: "Director of Operations",
  description:
    "Aerospace manufacturing operations leader. CNC, lean manufacturing, 50+ employees.",
});

const match = matchControlledTags({
  required: job.tags,
  candidate: resume.tags,
});
check("match_score", match.score >= 50, `score=${match.score} gaps=${match.gaps.map((g) => g.label).join(",")}`);

check(
  "synonym_search",
  recordMatchesQuery({
    query: "Project Manager",
    tags: ["Project Management"],
    fields: ["Senior Project Manager"],
  }),
  "PM synonym"
);

process.exit(failed ? 1 : 0);
