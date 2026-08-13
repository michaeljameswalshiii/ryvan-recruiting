/**
 * Seed realistic CRM activity notes across all customer tenants.
 *
 * Usage:
 *   node scripts/seed-activity-notes.mjs --dry-run
 *   node scripts/seed-activity-notes.mjs --execute
 *
 * The script only adds events. It does not delete or update CRM objects.
 */
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLES = {
  tenants: process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants',
  clients: process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients',
  leads: process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads',
  jobs: process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs',
  events: process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events',
};
const PLATFORM_TENANT = 'tenant-platform';
const TARGET_NOTES = Number(process.env.ACTIVITY_NOTE_TARGET || 2400);
const execute = process.argv.includes('--execute');
const client = new DynamoDBClient({ region: REGION });

const NOTE_TYPES = [
  ['phone_call', 'Phone call'],
  ['email_sent', 'Email sent'],
  ['meeting', 'Meeting'],
  ['follow_up', 'Follow-up'],
  ['general', 'General note'],
  ['check_in', 'Check-in'],
  ['proposal_sent', 'Proposal sent'],
  ['other', 'Other'],
];
const SUBJECTS = [
  'Discussed hiring priorities and next steps.',
  'Shared candidate profile and confirmed interest.',
  'Left voicemail and scheduled a follow-up.',
  'Reviewed role requirements and compensation range.',
  'Checked in after the interview and captured feedback.',
  'Confirmed availability for the next stage.',
  'Sent a recap with action items and owners.',
  'Updated contact details and preferred communication channel.',
  'Discussed timeline, stakeholders, and decision process.',
  'No answer. Follow up again next week.',
];

async function scanAll(tableName) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items || []).map(unmarshall));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function pick(list, index) {
  return list[index % list.length];
}

function tenantIdOf(row) {
  return String(row.tenant_id || row.tenantId || '').trim();
}

function contactsForCompany(company) {
  return Array.isArray(company.contacts)
    ? company.contacts.filter((contact) => contact?.id)
    : [];
}

function buildEvent(tenantId, subject, index, contact, company, candidate, job) {
  const [type, label] = pick(NOTE_TYPES, index);
  const now = Date.now() - ((index * 37) % (180 * 24 * 60 * 60 * 1000));
  const createdAt = new Date(now).toISOString();
  const contactId = contact?.id || candidate?.id || `tenant-${tenantId}`;
  const companyId = company?.id || candidate?.companyId || undefined;
  const entityId = candidate?.id || contactId;
  const title = `${label} - demo activity`;
  const content = `${pick(SUBJECTS, index)} ${company?.name || candidate?.company || 'Customer account'}${job?.title ? ` · ${job.title}` : ''}`;

  return {
    PK: tenantId,
    SK: `CONTACT#${contactId}#EVENT#${createdAt}#${String(index).padStart(5, '0')}`,
    id: `demo-note-${tenantId}-${index}-${now}`,
    tenant_id: tenantId,
    tenantId,
    contactId,
    companyId,
    entityId,
    entityType: contact ? 'contact' : candidate ? 'candidate' : 'company',
    type,
    eventType: 'NOTE',
    title,
    description: content,
    content,
    createdAt,
    createdBy: 'demo-data@trio-recruiting.com',
    metadata: {
      demoSeed: 'activity-notes-v1',
      noteType: type,
      noteTypeLabel: label,
      jobId: job?.id,
      candidateId: candidate?.id,
    },
  };
}

async function writeItems(items) {
  for (let i = 0; i < items.length; i += 25) {
    let requestItems = {
      [TABLES.events]: items.slice(i, i + 25).map((item) => ({
        PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
      })),
    };
    let attempts = 0;
    while (Object.keys(requestItems).length) {
      const result = await client.send(new BatchWriteItemCommand({ RequestItems: requestItems }));
      requestItems = result.UnprocessedItems || {};
      if (Object.keys(requestItems).length) {
        attempts += 1;
        if (attempts > 8) throw new Error('Too many unprocessed DynamoDB writes');
        await new Promise((resolve) => setTimeout(resolve, attempts * 150));
      }
    }
    if ((i / 25) % 10 === 0) console.log(`  wrote ${Math.min(i + 25, items.length)}/${items.length} events`);
  }
}

async function main() {
  console.log(execute ? 'MODE: EXECUTE' : 'MODE: DRY RUN');
  const [tenants, companies, candidates, jobs] = await Promise.all([
    scanAll(TABLES.tenants),
    scanAll(TABLES.clients),
    scanAll(TABLES.leads),
    scanAll(TABLES.jobs),
  ]);
  const customerTenants = tenants.filter((tenant) => tenant.id && tenant.id !== PLATFORM_TENANT);
  const byTenant = new Map();
  for (const tenant of customerTenants) {
    const id = tenant.id;
    byTenant.set(id, {
      tenant,
      companies: companies.filter((row) => tenantIdOf(row) === id),
      candidates: candidates.filter((row) => tenantIdOf(row) === id),
      jobs: jobs.filter((row) => tenantIdOf(row) === id),
    });
  }

  const active = [...byTenant.values()].filter((group) => group.companies.length || group.candidates.length || group.jobs.length);
  const events = [];
  let globalIndex = 0;
  for (const group of active) {
    const contacts = group.companies.flatMap(contactsForCompany);
    const poolSize = contacts.length + group.candidates.length + group.companies.length;
    const count = Math.max(25, Math.round(TARGET_NOTES * (poolSize / Math.max(1, active.reduce((sum, item) => sum + item.companies.length + item.candidates.length + item.jobs.length, 0)))));
    for (let i = 0; i < count; i += 1) {
      const company = group.companies[i % Math.max(1, group.companies.length)];
      const candidate = group.candidates[i % Math.max(1, group.candidates.length)];
      const job = group.jobs[i % Math.max(1, group.jobs.length)];
      const contact = contacts[i % Math.max(1, contacts.length)];
      events.push(buildEvent(group.tenant.id, `activity-${globalIndex}`, globalIndex, contact, company, candidate, job));
      globalIndex += 1;
    }
    console.log(`  ${group.tenant.name || group.tenant.id}: ${count} notes (${group.companies.length} companies, ${group.candidates.length} candidates, ${group.jobs.length} jobs)`);
  }

  console.log(`Tenants with CRM data: ${active.length}`);
  console.log(`Activity events planned: ${events.length}`);
  if (execute && events.length) await writeItems(events);
  console.log(execute ? 'Done.' : 'Dry run complete. Re-run with --execute to write data.');
}

main().catch((error) => { console.error(error); process.exit(1); });
