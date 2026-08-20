/**
 * Copy existing search result sets into the shared market-source pool.
 * Does not import tenant candidates / contacts / companies.
 *
 *   npx tsx scripts/backfill-market-sources.ts           # dry run
 *   npx tsx scripts/backfill-market-sources.ts --apply   # write
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(fileName: string) {
  const p = resolve(process.cwd(), fileName);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const file of [
  '.env.local',
  '.env.production',
  '.env.vercel.pull',
  '.env.vercel.trio.pull',
  '.env.vercel',
]) {
  loadEnvFile(file);
}

const apply = process.argv.includes('--apply');

type RunRow = {
  id?: string;
  jobId?: string;
  type?: string;
  fillRunId?: string;
  query?: string;
  brief?: string;
  jobTitle?: string;
  jobLocation?: string;
  location?: string;
  geography?: string;
  titles?: string[];
  candidates?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
};

function shortRunId(row: RunRow): string {
  if (row.jobId) return String(row.jobId);
  const id = String(row.id || '');
  return id.includes('#') ? id.split('#').pop() || id : id;
}

async function main() {
  const { scanItems, tableNames } = await import('../src/lib/db/dynamodb');
  const { ingestMarketSourceBatch } = await import(
    '../src/lib/market-source/ingest'
  );
  const { shouldSkipAtsSource } = await import('../src/lib/market-source/ids');
  const { countMarketSources } = await import(
    '../src/lib/db/repositories/market-source-repository'
  );

  console.log(apply ? 'APPLY — writing market-source records' : 'DRY RUN — no writes');

  const rows = await scanItems<RunRow>(
    tableNames.profiles,
    '#type IN (:fill, :rec, :clb, :lb)',
    {
      ':fill': 'fill_job_run',
      ':rec': 'recruiter_agent_run',
      ':clb': 'candidate_list_builder',
      ':lb': 'list_builder',
    },
    { '#type': 'type' }
  );

  let fillRuns = 0;
  let recruiterRuns = 0;
  let clbJobs = 0;
  let lbJobs = 0;
  let people = 0;
  let companies = 0;
  let skippedAts = 0;

  for (const row of rows) {
    const type = String(row.type || '');
    if (type === 'fill_job_run' || type === 'recruiter_agent_run') {
      if (type === 'recruiter_agent_run' && row.fillRunId) {
        recruiterRuns++;
        continue;
      }
      if (type === 'fill_job_run') fillRuns++;
      else recruiterRuns++;
      const candidates = Array.isArray(row.candidates) ? row.candidates : [];
      const peopleRows = [];
      for (const c of candidates) {
        if (shouldSkipAtsSource(String(c.source || ''))) {
          skippedAts++;
          continue;
        }
        peopleRows.push({
          name: String(c.name || ''),
          title: c.title ? String(c.title) : undefined,
          company: c.company ? String(c.company) : undefined,
          location: c.location ? String(c.location) : undefined,
          email: c.email ? String(c.email) : undefined,
          phone: c.phone ? String(c.phone) : undefined,
          linkedinUrl: c.linkedinUrl ? String(c.linkedinUrl) : undefined,
          source: c.source ? String(c.source) : undefined,
          role: 'candidate' as const,
        });
      }
      if (!apply) {
        people += peopleRows.length;
        continue;
      }
      const result = await ingestMarketSourceBatch({
        surface: type === 'fill_job_run' ? 'fill_job' : 'recruiter',
        query: row.query,
        title: row.jobTitle,
        location: row.jobLocation || row.location,
        runKey:
          type === 'fill_job_run'
            ? `fill:${shortRunId(row)}`
            : `rec:${shortRunId(row)}`,
        people: peopleRows,
      });
      people += result.people;
      companies += result.companies;
      continue;
    }

    if (type === 'candidate_list_builder') {
      clbJobs++;
      const results = Array.isArray(row.results) ? row.results : [];
      const peopleRows = results.map((r) => ({
        name: String(r.name || ''),
        title: r.title ? String(r.title) : undefined,
        company: r.company ? String(r.company) : undefined,
        location:
          String(r.location || '') ||
          [r.city, r.state].filter(Boolean).join(', '),
        email: r.email ? String(r.email) : undefined,
        phone: r.phone ? String(r.phone) : undefined,
        linkedinUrl: r.linkedinUrl ? String(r.linkedinUrl) : undefined,
        pdlId: r.pdlId ? String(r.pdlId) : undefined,
        source: 'pdl',
        role: 'candidate' as const,
      }));
      if (!apply) {
        people += peopleRows.length;
        continue;
      }
      const result = await ingestMarketSourceBatch({
        surface: 'candidate_list_builder',
        query: row.brief,
        title: Array.isArray(row.titles) ? row.titles[0] : undefined,
        location: row.geography,
        source: 'pdl',
        runKey: `clb:${shortRunId(row)}`,
        people: peopleRows,
      });
      people += result.people;
      companies += result.companies;
      continue;
    }

    if (type === 'list_builder') {
      lbJobs++;
      const results = Array.isArray(row.results) ? row.results : [];
      if (!apply) {
        companies += results.length;
        people += results.filter((r) => r.contactName).length;
        continue;
      }
      const result = await ingestMarketSourceBatch({
        surface: 'company_list_builder',
        query: row.brief,
        location: row.geography,
        runKey: `lb:${shortRunId(row)}`,
        companies: results.map((r) => ({
          name: String(r.companyName || ''),
          website: r.website ? String(r.website) : undefined,
          city: r.city ? String(r.city) : undefined,
          state: r.state ? String(r.state) : undefined,
          industry: r.industry ? String(r.industry) : undefined,
          employeeCount:
            typeof r.employeeCount === 'number' ? r.employeeCount : undefined,
          companySize: r.companySize ? String(r.companySize) : undefined,
          source: 'list_builder',
        })),
        people: results
          .filter((r) => r.contactName)
          .map((r) => ({
            name: String(r.contactName || ''),
            title: r.contactTitle ? String(r.contactTitle) : undefined,
            company: r.companyName ? String(r.companyName) : undefined,
            location: [r.city, r.state].filter(Boolean).join(', '),
            email: r.email ? String(r.email) : undefined,
            phone: r.phone ? String(r.phone) : undefined,
            source: 'list_builder',
            role: 'contact' as const,
          })),
      });
      people += result.people;
      companies += result.companies;
    }
  }

  console.log({
    scannedRuns: rows.length,
    fillRuns,
    recruiterRuns,
    clbJobs,
    lbJobs,
    skippedAts,
    ingestedPeople: people,
    ingestedCompanies: companies,
  });

  if (apply) {
    const { rebuildMarketSourceIndexes } = await import(
      '../src/lib/db/repositories/market-source-repository'
    );
    const rebuilt = await rebuildMarketSourceIndexes();
    console.log('rebuilt indexes', rebuilt);
    const counts = await countMarketSources();
    console.log('market-source totals', counts);
  } else {
    console.log('Re-run with --apply to write these into DynamoDB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
