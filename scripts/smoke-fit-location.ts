import { scoreCandidateJobFit } from "../src/lib/ai/fit-score";

const candidate = {
  title: "Director of Manufacturing & Manufacturing Engineering",
  summary:
    "25+ years manufacturing leadership. Lean, Six Sigma Black Belt, AS9100, FAA, Kaizen, PFMEA, OEE, Oracle ERP, SAP, Minitab. Runs production, engineering, test, and CI over 95 associates.",
  skills: ["lean", "six sigma", "kaizen", "oee", "pfmea", "sap", "oracle", "minitab"],
  location: "Weston, FL 33327",
  experience: [
    {
      title: "Director of Manufacturing & Manufacturing Engineering",
      company: "Dayton Granger",
      dates: "2025-Present",
      description:
        "Lead manufacturing operations in Fort Lauderdale. Production, engineering, config management, test, CI. 15 direct reports. Lean line balancing, 80% throughput increase.",
    },
    {
      title: "Manufacturing Engineering Manager",
      company: "MSK Precision Products",
      dates: "2018-2025",
      description:
        "Precision metal forming, machining, quality systems, process control in a regulated shop.",
    },
  ],
};

const job = {
  title: "Director of Operations",
  companyName: "MSK Precision Products",
  location: "",
  description: `
Director of Operations for a precision manufacturing facility in Fort Lauderdale, FL.
Lead a complex, mission-critical manufacturing operation. Full facility P&L.
Oversight of production, supply chain, and maintenance. Report to COO.
Regulated environments where quality and process control are mission critical.
Lean, Six Sigma, Kaizen, VSM, 5S, RCA, KPIs/OEE. Metal forming, stamping, CNC.
15+ years manufacturing leadership required.
`,
};

const r = scoreCandidateJobFit(candidate, job);
const loc = r.dimensions.find((d) => d.id === "location_arrangement");
const industry = r.dimensions.find((d) => d.id === "industry_domain");

console.log({
  overall: r.score,
  grade: r.grade,
  location: loc,
  industry: industry?.score,
  field: r.fieldFit?.alignment,
  v1: r.v1Score,
  rubric: r.v2RubricScore,
});

const checks: Array<[string, boolean]> = [
  ["location_at_least_90", (loc?.score || 0) >= 90],
  ["location_says_local", /local|fort lauderdale|weston/i.test(loc?.detail || "")],
  ["not_unknown_location", !/not specific enough/i.test(loc?.detail || "")],
  ["overall_stronger_than_54", r.score >= 70],
  ["same_field", r.fieldFit?.alignment === "same"],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
