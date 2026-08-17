/**
 * Smoke Boolean Generator against 3 job-shaped inputs.
 * Loads Vercel env for Bedrock, then falls back to tag strings if Claude is unavailable.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

loadEnvFile(resolve(process.cwd(), ".env.vercel.pull"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const jobs = [
  {
    name: "MSK ops / confidential",
    job: {
      title: "Director of Operations — CONFIDENTIAL",
      location: "Atlanta, GA",
      tags: [
        "engineering",
        "six-sigma",
        "cnc",
        "lean-manufacturing",
        "manufacturing",
        "operations",
      ],
      salaryRange: "$180,000 - $220,000",
      description:
        "Lead multi-site precision manufacturing operations. CNC, Lean, Six Sigma, plant leadership.",
      companyName: "MSK Precision",
    },
  },
  {
    name: "Construction PM",
    job: {
      title: "Project Manager",
      location: "Dallas, TX",
      tags: ["construction", "project-management", "commercial-construction"],
      salaryRange: "$120,000 - $150,000",
      description:
        "Commercial GC project manager for ground-up and interiors. Budget, schedule, subcontractors.",
      companyName: "Walsh Construction",
    },
  },
  {
    name: "Ministry pastor",
    job: {
      title: "Lead Pastor",
      location: "Orlando, FL",
      tags: ["ministry", "leadership"],
      description: "Lead pastor for a growing congregation. Preaching, staff leadership, pastoral care.",
      companyName: "Grace Church",
    },
  },
];

async function main() {
  const { generateJobBooleanStrings } = await import(
    "../src/lib/sourcing/generate-boolean.ts"
  );
  const { isConfidentialJob, fallbackBooleanStrings } = await import(
    "../src/lib/sourcing/boolean-prompt.ts"
  );

  let failed = 0;
  for (const sample of jobs) {
    console.log(`\n===== ${sample.name} =====`);
    console.log("confidential", isConfidentialJob(sample.job));
    const fallback = fallbackBooleanStrings(sample.job);
    console.log("fallback count", fallback.length);
    if (isConfidentialJob(sample.job)) {
      const leaked = fallback.some((s) => /MSK/i.test(s.query));
      console.log("fallback leaks company", leaked);
      if (leaked) failed += 1;
    }
    try {
      const { cache } = await generateJobBooleanStrings({
        job: sample.job,
      });
      console.log("model", cache.model, "strings", cache.strings.length);
      for (const row of cache.strings) {
        console.log(`- [${row.platform}] ${row.label}: ${row.query}`);
        if (/MSK Precision|Walsh Construction|Grace Church/i.test(row.query)) {
          console.log("  LEAKED COMPANY NAME");
          failed += 1;
        }
      }
      if (cache.strings.length < 3) failed += 1;
    } catch (err) {
      console.log("generate failed", err instanceof Error ? err.message : err);
      if (fallback.length < 3) failed += 1;
    }
  }

  if (failed) {
    console.error(`\nFAILED checks: ${failed}`);
    process.exit(1);
  }
  console.log("\nok");
}

void main();
