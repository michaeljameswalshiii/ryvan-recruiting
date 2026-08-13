/**
 * Purge + reseed Demo tenant with fake CRM data.
 *
 * Usage:
 *   node scripts/seed-demo-tenant.mjs --dry-run
 *   node scripts/seed-demo-tenant.mjs --execute
 *
 * Also deletes empty junk tenants from turnkey-tenants.
 */
import {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
  PutItemCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const DEMO_TENANT = 'tenant-1784069675716-demo';
const EMPTY_TENANTS = [
  'tenant-1780937012560-9ictwkn4e',
  'tenant-1778593443269-u7u7dp4jo',
  'tenant-1778594705221', // Test Company (removed from prod 2026-08)
];

const TABLES = {
  clients: process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients',
  leads: process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads',
  jobs: process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs',
  events: process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events',
  tenants: process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants',
};

const COUNTS = {
  companies: 200,
  jobs: 200,
  candidates: 200,
};

const execute = process.argv.includes('--execute');
const dryRun = !execute;

const client = new DynamoDBClient({ region: REGION });

// ─── Catalog ───────────────────────────────────────────────────────────────

const INDUSTRIES = [
  { industry: 'Hospitality', companies: ['Coastal Hospitality Group', 'Palm Bay Resorts', 'Gulfstream Hotels', 'Harbor View Inns', 'Sunnyside Catering Co'] },
  { industry: 'Construction', companies: ['Apex Builders LLC', 'Keystone Construction', 'Summit Commercial GC', 'Ironclad Structures', 'Bluewater Renovations'] },
  { industry: 'Healthcare', companies: ['Evergreen Medical Partners', 'Baycare Staffing Clinic', 'Horizon Home Health', 'Lakeside Therapy Group', 'Metro Imaging Centers'] },
  { industry: 'Manufacturing', companies: ['Precision Metal Works', 'Atlantic Components Inc', 'Forge & Form Industries', 'Clearwater Plastics', 'Southline Assembly'] },
  { industry: 'Technology', companies: ['Nimbus Softworks', 'Coral Code Labs', 'Vector Analytics', 'Orbit Cloud Services', 'Pinnacle App Co'] },
  { industry: 'Finance', companies: ['Shoreline Capital Advisors', 'First Harbor Credit Union', 'Meridian Wealth Partners', 'Gulf Financial Group', 'Tradewind Accounting'] },
  { industry: 'Logistics', companies: ['East Coast Freight Co', 'Palm Logistics Hub', 'RapidRoute Distribution', 'Portside Warehousing', 'LaneLine Trucking'] },
  { industry: 'Retail', companies: ['Seaside Outfitters', 'Metro Market Collective', 'BrightPath Retail Ops', 'Island Goods Co', 'Urban Cart Concepts'] },
];

const JOB_TEMPLATES = [
  { title: 'Director of Operations', type: 'Full-time', salary: '$120k–$150k' },
  { title: 'General Manager', type: 'Full-time', salary: '$90k–$115k' },
  { title: 'Project Manager', type: 'Full-time', salary: '$95k–$125k' },
  { title: 'Plant Manager', type: 'Full-time', salary: '$110k–$140k' },
  { title: 'Controller', type: 'Full-time', salary: '$100k–$130k' },
  { title: 'HR Manager', type: 'Full-time', salary: '$80k–$105k' },
  { title: 'Sales Director', type: 'Full-time', salary: '$100k–$140k OTE' },
  { title: 'Software Engineer', type: 'Full-time', salary: '$110k–$145k' },
  { title: 'Registered Nurse', type: 'Full-time', salary: '$75k–$95k' },
  { title: 'Construction Superintendent', type: 'Full-time', salary: '$95k–$120k' },
  { title: 'Warehouse Supervisor', type: 'Full-time', salary: '$60k–$75k' },
  { title: 'Marketing Manager', type: 'Full-time', salary: '$85k–$110k' },
  { title: 'Executive Assistant', type: 'Full-time', salary: '$55k–$70k' },
  { title: 'Finance Implementation Specialist', type: 'Contract', salary: '$70–$95/hr' },
  { title: 'Shift Leader', type: 'Full-time', salary: '$45k–$55k' },
];

const LOCATIONS = [
  'Tampa, FL',
  'Boca Raton, FL',
  'Fort Lauderdale, FL',
  'Orlando, FL',
  'Miami, FL',
  'Jacksonville, FL',
  'Naples, FL',
  'REMOTE',
  'Atlanta, GA',
  'Charlotte, NC',
];

const FIRST = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Sam', 'Jamie', 'Cameron', 'Drew', 'Blake', 'Reese', 'Parker', 'Skyler',
  'Chris', 'Pat', 'Dana', 'Lee', 'Robin', 'Jesse', 'Kelly', 'Shannon',
  'Marcus', 'Priya', 'Sofia', 'Diego', 'Nina', 'Omar', 'Elena', 'Kai',
];
const LAST = [
  'Nguyen', 'Patel', 'Garcia', 'Johnson', 'Williams', 'Brown', 'Davis',
  'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson',
  'White', 'Harris', 'Martin', 'Thompson', 'Martinez', 'Robinson', 'Clark',
  'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King',
  'Wright', 'Lopez', 'Hill',
];
const TITLES_HM = [
  'VP of Operations',
  'HR Director',
  'Talent Acquisition Lead',
  'Chief Operating Officer',
  'Plant Director',
  'General Manager',
  'Director of People',
  'Hiring Manager',
];
const CANDIDATE_TITLES = [
  'Operations Manager',
  'Senior Project Manager',
  'Plant Supervisor',
  'Staff Accountant',
  'Sales Manager',
  'Full Stack Engineer',
  'Clinical Nurse Manager',
  'Site Superintendent',
  'Logistics Coordinator',
  'Marketing Specialist',
  'Business Analyst',
  'Office Manager',
];
const STAGES = [
  'sourced',
  'contacted',
  'interested',
  'pre_screened',
  'submitted',
  'interviewing',
  'offer_out',
  'rejected',
];

function pick(arr, i) {
  return arr[i % arr.length];
}
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
}

// ─── Dynamo helpers ────────────────────────────────────────────────────────

async function scanAll(tableName, filterExpr, values) {
  const items = [];
  let start;
  do {
    const r = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpr,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: start,
      })
    );
    for (const it of r.Items || []) items.push(unmarshall(it));
    start = r.LastEvaluatedKey;
  } while (start);
  return items;
}

async function batchDelete(tableName, keys) {
  // keys: array of attribute maps already for DeleteRequest
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    let requestItems = {
      [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key: marshall(Key) } })),
    };
    let attempt = 0;
    while (requestItems && Object.keys(requestItems).length) {
      const r = await client.send(
        new BatchWriteItemCommand({ RequestItems: requestItems })
      );
      requestItems = r.UnprocessedItems;
      if (requestItems && Object.keys(requestItems).length) {
        attempt += 1;
        await new Promise((res) => setTimeout(res, 100 * attempt));
      } else {
        break;
      }
    }
  }
}

async function put(tableName, item) {
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    })
  );
}

async function purgeTenant(tenantId) {
  console.log(`\n── Purge tenant ${tenantId} ──`);

  // clients / leads / jobs: keys tenant_id + id
  for (const [label, table] of [
    ['clients', TABLES.clients],
    ['leads', TABLES.leads],
    ['jobs', TABLES.jobs],
  ]) {
    const rows = await scanAll(table, 'tenant_id = :tid', {
      ':tid': { S: tenantId },
    });
    console.log(`  ${label}: ${rows.length} to delete`);
    if (!dryRun && rows.length) {
      await batchDelete(
        table,
        rows.map((r) => ({ tenant_id: r.tenant_id, id: r.id }))
      );
    }
  }

  // events: PK/SK; filter tenantId
  const events = await scanAll(TABLES.events, 'tenantId = :tid', {
    ':tid': { S: tenantId },
  });
  console.log(`  events: ${events.length} to delete`);
  if (!dryRun && events.length) {
    await batchDelete(
      TABLES.events,
      events.map((e) => ({ PK: e.PK, SK: e.SK }))
    );
  }
}

async function deleteEmptyTenants() {
  console.log('\n── Delete empty tenants ──');
  for (const id of EMPTY_TENANTS) {
    console.log(`  tenants row: ${id}`);
    if (!dryRun) {
      await client.send(
        new DeleteItemCommand({
          TableName: TABLES.tenants,
          Key: marshall({ id }),
        })
      );
    }
  }
}

// ─── Seed ──────────────────────────────────────────────────────────────────

async function seedDemo() {
  const now = new Date().toISOString();
  console.log(`\n── Seed ${DEMO_TENANT} ──`);

  // Build company list (40)
  const companies = [];
  let n = 0;
  for (const block of INDUSTRIES) {
    for (const name of block.companies) {
      if (n >= COUNTS.companies) break;
      const id = randomUUID();
      const domain = `${slug(name)}.example.com`;
      const hmFirst = pick(FIRST, n * 3);
      const hmLast = pick(LAST, n * 5);
      const hmName = `${hmFirst} ${hmLast}`;
      const hmEmail = `${hmFirst.toLowerCase()}.${hmLast.toLowerCase()}@${domain}`;
      const contactId = randomUUID();
      companies.push({
        id,
        tenant_id: DEMO_TENANT,
        name,
        industry: block.industry,
        domain,
        website: `https://${domain}`,
        city: pick(LOCATIONS, n).split(',')[0] || 'Tampa',
        state: 'FL',
        country: 'US',
        status: pick(
          ['identification', 'outreach', 'conversation', 'client'],
          n
        ),
        description: `${name} is a ${block.industry.toLowerCase()} company based in Florida (demo data).`,
        contacts: [
          {
            id: contactId,
            name: hmName,
            title: pick(TITLES_HM, n),
            email: hmEmail,
            phone: `+1-555-${String(100 + (n % 900)).padStart(3, '0')}-${String(1000 + n).slice(-4)}`,
            isPrimary: true,
          },
        ],
        created_at: now,
        updated_at: now,
        modified_at: now,
      });
      n += 1;
    }
    if (n >= COUNTS.companies) break;
  }
  // pad if industries short
  while (companies.length < COUNTS.companies) {
    const i = companies.length;
    const block = INDUSTRIES[i % INDUSTRIES.length];
    const name = `${block.industry} Demo Co ${i + 1}`;
    const id = randomUUID();
    const domain = `democo${i}.example.com`;
    companies.push({
      id,
      tenant_id: DEMO_TENANT,
      name,
      industry: block.industry,
      domain,
      website: `https://${domain}`,
      city: 'Tampa',
      state: 'FL',
      country: 'US',
      status: 'identification',
      description: `Demo ${block.industry} firm.`,
      contacts: [
        {
          id: randomUUID(),
          name: `${pick(FIRST, i)} ${pick(LAST, i)}`,
          title: 'Hiring Manager',
          email: `hm${i}@${domain}`,
          phone: `+1-555-010-${String(i).padStart(4, '0')}`,
          isPrimary: true,
        },
      ],
      created_at: now,
      updated_at: now,
      modified_at: now,
    });
  }

  console.log(`  companies: ${companies.length}`);

  // Jobs (30) linked to companies
  const jobs = [];
  for (let i = 0; i < COUNTS.jobs; i++) {
    const co = companies[i % companies.length];
    const tmpl = pick(JOB_TEMPLATES, i);
    const hm = co.contacts[0];
    const id = randomUUID();
    jobs.push({
      id,
      tenant_id: DEMO_TENANT,
      title: tmpl.title,
      description: `${tmpl.title} opportunity at ${co.name} (${co.industry}). This is demo data for product demos.\n\nResponsibilities:\n- Lead day-to-day operations\n- Partner with leadership on growth\n- Build and mentor the team\n\nRequirements:\n- 5+ years relevant experience\n- Strong communication skills`,
      location: pick(LOCATIONS, i + 2),
      salaryRange: tmpl.salary,
      employmentType: tmpl.type,
      companyId: co.id,
      companyName: co.name,
      status: pick(['Open', 'Open', 'Open', 'Paused', 'Filled'], i),
      showOnWebsite: i % 4 === 0,
      hiringManagerContactId: hm?.id,
      hiringManagerName: hm?.name,
      hiringManagerTitle: hm?.title,
      hiringManagerEmail: hm?.email,
      hiringManagerPhone: hm?.phone,
      candidates: [],
      created_at: now,
      modified_at: now,
    });
  }
  console.log(`  jobs: ${jobs.length}`);

  // Candidates (50) — many linked to jobs
  const candidates = [];
  for (let i = 0; i < COUNTS.candidates; i++) {
    const first = pick(FIRST, i * 2);
    const last = pick(LAST, i * 3 + 1);
    const name = `${first} ${last}`;
    const id = randomUUID();
    const title = pick(CANDIDATE_TITLES, i);
    const location = pick(LOCATIONS, i + 1);
    const stage = pick(STAGES, i);
    const job = jobs[i % jobs.length];
    const linkThis = i % 5 !== 0; // ~80% linked

    const linkedJobs = linkThis
      ? [
          {
            jobId: job.id,
            jobTitle: job.title,
            companyId: job.companyId,
            companyName: job.companyName,
            stage,
            linkedAt: now,
          },
        ]
      : [];

    // mirror on job.candidates
    if (linkThis) {
      job.candidates = job.candidates || [];
      job.candidates.push({
        candidateId: id,
        candidateName: name,
        stage,
        linkedAt: now,
      });
    }

    candidates.push({
      id,
      tenant_id: DEMO_TENANT,
      name,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@demo-mail.example.com`,
      phone: `+1-555-${String(200 + (i % 700)).padStart(3, '0')}-${String(2000 + i).slice(-4)}`,
      location,
      title,
      company: linkThis ? job.companyName : pick(companies, i).name,
      status: stage === 'rejected' ? 'rejected' : 'identification',
      source: pick(['Manual', 'LinkedIn', 'Indeed', 'Referral', 'Careers'], i),
      notes: `Demo candidate profile for ${title}.`,
      linkedJobs,
      linkedJobIds: linkedJobs.map((j) => j.jobId),
      created_at: now,
      modified_at: now,
    });
  }
  console.log(`  candidates: ${candidates.length}`);
  console.log(
    `  job links: ${candidates.reduce((s, c) => s + (c.linkedJobs?.length || 0), 0)}`
  );

  if (dryRun) {
    console.log('\n[DRY RUN] No writes. Re-run with --execute to apply.');
    console.log('Sample companies:', companies.slice(0, 3).map((c) => c.name));
    console.log('Sample jobs:', jobs.slice(0, 3).map((j) => j.title));
    console.log('Sample candidates:', candidates.slice(0, 3).map((c) => c.name));
    return;
  }

  for (const co of companies) await put(TABLES.clients, co);
  console.log('  wrote companies');
  for (const j of jobs) await put(TABLES.jobs, j);
  console.log('  wrote jobs');
  for (const c of candidates) await put(TABLES.leads, c);
  console.log('  wrote candidates');
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(dryRun ? 'MODE: dry-run' : 'MODE: EXECUTE (prod writes)');
  console.log('Demo tenant:', DEMO_TENANT);
  console.log('Empty tenants to remove:', EMPTY_TENANTS.join(', '));

  await purgeTenant(DEMO_TENANT);
  await deleteEmptyTenants();
  await seedDemo();

  // Verify
  if (!dryRun) {
    console.log('\n── Verify ──');
    for (const [label, table] of [
      ['clients', TABLES.clients],
      ['leads', TABLES.leads],
      ['jobs', TABLES.jobs],
    ]) {
      const rows = await scanAll(table, 'tenant_id = :tid', {
        ':tid': { S: DEMO_TENANT },
      });
      console.log(`  ${label}: ${rows.length}`);
    }
    for (const id of EMPTY_TENANTS) {
      const r = await client.send(
        new ScanCommand({
          TableName: TABLES.tenants,
          FilterExpression: 'id = :id',
          ExpressionAttributeValues: { ':id': { S: id } },
          Select: 'COUNT',
        })
      );
      console.log(`  tenant ${id} still present: ${r.Count}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
