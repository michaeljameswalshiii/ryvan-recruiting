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

for (const file of ['.env.local', '.env.production', '.env.vercel.pull']) {
  loadEnvFile(file);
}

async function main() {
  const {
    listMarketPeople,
    listMarketCompanies,
    rebuildMarketSourceIndexes,
  } = await import('../src/lib/db/repositories/market-source-repository');

  if (process.argv.includes('--rebuild')) {
    const rebuilt = await rebuildMarketSourceIndexes();
    console.log('rebuilt indexes', rebuilt);
  }

  const people = await listMarketPeople();
  const companies = await listMarketCompanies();
  const samplePerson = people[0];
  const sampleCompany = companies[0];
  console.log(
    JSON.stringify(
      {
        people: people.length,
        companies: companies.length,
        samplePerson: samplePerson
          ? {
              name: samplePerson.name,
              title: samplePerson.title,
              company: samplePerson.company,
              roles: samplePerson.roles,
            }
          : null,
        sampleCompany: sampleCompany
          ? {
              name: sampleCompany.name,
              city: sampleCompany.city,
              industry: sampleCompany.industry,
            }
          : null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
