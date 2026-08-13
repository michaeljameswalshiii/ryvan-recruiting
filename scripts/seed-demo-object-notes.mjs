/**
 * Replace the original Demo activity seed with notes scoped to each CRM object.
 *
 * Usage:
 *   node scripts/seed-demo-object-notes.mjs --dry-run
 *   node scripts/seed-demo-object-notes.mjs --execute
 */
import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLES = {
  clients: process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients',
  leads: process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads',
  jobs: process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs',
  events: process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events',
};
const DEMO_TENANT = 'tenant-1784069675716-demo';
const OLD_SEED = 'activity-notes-v1';
const NEW_SEED = 'demo-object-notes-v2';
const execute = process.argv.includes('--execute');
const client = new DynamoDBClient({ region: REGION });

const NOTE_TYPES = [
  ['general', 'General note'],
  ['phone_call', 'Phone call'],
  ['email_sent', 'Email sent'],
  ['meeting', 'Meeting'],
  ['follow_up', 'Follow-up'],
  ['check_in', 'Check-in'],
  ['proposal_sent', 'Proposal sent'],
  ['interview_feedback', 'Interview feedback'],
  ['availability_check', 'Availability check'],
  ['compensation_review', 'Compensation review'],
  ['reference_check', 'Reference check'],
  ['client_update', 'Client update'],
  ['next_steps', 'Next steps'],
  ['no_answer', 'No answer'],
  ['relationship_touch', 'Relationship touch'],
];

const NOTE_TEXT = [
  'Reviewed priorities and agreed on the next action for this record.',
  'Shared an update and confirmed the preferred follow-up channel.',
  'Discussed timing, stakeholders, and the decision process.',
  'Captured open questions and assigned owners for follow-up.',
  'Confirmed current availability and interest in continuing the conversation.',
  'Sent a concise recap with action items and target dates.',
  'Reviewed requirements and documented the most important constraints.',
  'Checked in after the last touchpoint and recorded the response.',
  'Compared options and noted the recommendation for the next review.',
  'Requested additional information before moving this record forward.',
  'Confirmed the information on file and identified one item to verify.',
  'Discussed expectations, communication cadence, and next milestones.',
  'Recorded feedback from the latest conversation for the recruiting team.',
  'No response received; schedule another outreach attempt.',
  'Relationship touchpoint completed and follow-up reminder added.',
  'Reviewed recent activity and aligned on the next checkpoint.',
  'Clarified responsibilities and documented the handoff details.',
  'Validated the current status and noted any risk to the timeline.',
  'Shared relevant context with the team for the next decision.',
  'Closed the loop on the previous request and recorded the outcome.',
];

function tenantIdOf(row) {
  return String(row.tenant_id || row.tenantId || '').trim();
}

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

function contactsForCompany(company) {
  return Array.isArray(company.contacts)
    ? company.contacts.filter((contact) => contact?.id)
    : [];
}

function noteCount(index) {
  return 10 + (index % 11);
}

function noteDetails(objectType, object, sequence, globalIndex) {
  const [noteType, noteTypeLabel] = NOTE_TYPES[globalIndex % NOTE_TYPES.length];
  const subject = object.name || object.title || object.fullName || object.email || object.id;
  const text = `${NOTE_TEXT[globalIndex % NOTE_TEXT.length]} ${subject} (activity ${sequence}).`;
  const createdAt = new Date(Date.now() - (globalIndex + 1) * 37 * 60 * 1000).toISOString();
  const metadata = {
    demoSeed: NEW_SEED,
    noteType,
    noteTypeLabel,
    objectType,
    objectId: object.id,
    sequence,
  };
  return { noteType, noteTypeLabel, text, createdAt, metadata };
}

function companyEvent(company, sequence, globalIndex) {
  const note = noteDetails('company', company, sequence, globalIndex);
  return {
    PK: `COMPANY#${company.id}`,
    SK: `EVENT#${note.createdAt}`,
    companyId: company.id,
    tenantId: DEMO_TENANT,
    tenant_id: DEMO_TENANT,
    eventType: 'NOTE',
    type: note.noteType,
    title: `${note.noteTypeLabel} - ${company.name || company.id}`,
    description: note.text,
    content: note.text,
    createdAt: note.createdAt,
    createdBy: 'demo-data@trio-recruiting.com',
    metadata: note.metadata,
  };
}

function contactEvent(company, contact, sequence, globalIndex) {
  const note = noteDetails('contact', contact, sequence, globalIndex);
  return {
    PK: DEMO_TENANT,
    SK: `CONTACT#${contact.id}#EVENT#${note.createdAt}#${String(globalIndex).padStart(6, '0')}`,
    id: `demo-object-note-${globalIndex}`,
    tenantId: DEMO_TENANT,
    tenant_id: DEMO_TENANT,
    contactId: contact.id,
    companyId: company.id,
    entityId: contact.id,
    entityType: 'contact',
    eventType: 'NOTE',
    type: note.noteType,
    title: `${note.noteTypeLabel} - ${contact.name || contact.email || contact.id}`,
    description: `${note.text} Company: ${company.name || company.id}.`,
    content: `${note.text} Company: ${company.name || company.id}.`,
    createdAt: note.createdAt,
    createdBy: 'demo-data@trio-recruiting.com',
    metadata: { ...note.metadata, companyId: company.id, contactId: contact.id },
  };
}

function entityEvent(objectType, object, sequence, globalIndex) {
  const note = noteDetails(objectType, object, sequence, globalIndex);
  return {
    PK: `ENTITY#${objectType}#${object.id}`,
    SK: `EVENT#${note.createdAt}`,
    GSI1PK: `TENANT#${DEMO_TENANT}`,
    GSI1SK: `EVENT#${note.createdAt}`,
    tenantId: DEMO_TENANT,
    tenant_id: DEMO_TENANT,
    entityId: object.id,
    entityType: objectType,
    eventType: 'NOTE',
    type: note.noteType,
    title: `${note.noteTypeLabel} - ${object.name || object.title || object.id}`,
    description: note.text,
    content: note.text,
    createdAt: note.createdAt,
    createdBy: 'demo-data@trio-recruiting.com',
    metadata: note.metadata,
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
    if ((i / 25) % 20 === 0) console.log(`  wrote ${Math.min(i + 25, items.length)}/${items.length} events`);
  }
}

async function deleteOldDemoEvents(events) {
  const oldEvents = events.filter((event) => (
    tenantIdOf(event) === DEMO_TENANT && event.metadata?.demoSeed === OLD_SEED
  ));
  console.log(`Original Demo seed events to remove: ${oldEvents.length}`);
  if (!execute) return oldEvents.length;
  for (let i = 0; i < oldEvents.length; i += 25) {
    await client.send(new BatchWriteItemCommand({
      RequestItems: {
        [TABLES.events]: oldEvents.slice(i, i + 25).map((event) => ({
          DeleteRequest: { Key: marshall({ PK: event.PK, SK: event.SK }) },
        })),
      },
    }));
  }
  return oldEvents.length;
}

async function main() {
  console.log(execute ? 'MODE: EXECUTE' : 'MODE: DRY RUN');
  const [companies, candidates, jobs, events] = await Promise.all([
    scanAll(TABLES.clients),
    scanAll(TABLES.leads),
    scanAll(TABLES.jobs),
    scanAll(TABLES.events),
  ]);
  const demoCompanies = companies.filter((row) => tenantIdOf(row) === DEMO_TENANT);
  const demoCandidates = candidates.filter((row) => tenantIdOf(row) === DEMO_TENANT);
  const demoJobs = jobs.filter((row) => tenantIdOf(row) === DEMO_TENANT);
  const demoContacts = demoCompanies.flatMap((company) => (
    contactsForCompany(company).map((contact) => ({ company, contact }))
  ));
  const planned = [];
  let globalIndex = 0;
  const addNotes = (objectType, object, count, builder) => {
    for (let sequence = 1; sequence <= count; sequence += 1) {
      planned.push(builder(object, sequence, globalIndex));
      globalIndex += 1;
    }
  };
  demoCompanies.forEach((company, index) => addNotes('company', company, noteCount(index), companyEvent));
  demoContacts.forEach(({ company, contact }, index) => {
    for (let sequence = 1; sequence <= noteCount(index); sequence += 1) {
      planned.push(contactEvent(company, contact, sequence, globalIndex));
      globalIndex += 1;
    }
  });
  demoCandidates.forEach((candidate, index) => addNotes('candidate', candidate, noteCount(index), (object, sequence, i) => entityEvent('candidate', object, sequence, i)));
  demoJobs.forEach((job, index) => addNotes('job', job, noteCount(index), (object, sequence, i) => entityEvent('job', object, sequence, i)));

  console.log(`Demo objects: ${demoCompanies.length} companies, ${demoContacts.length} contacts, ${demoCandidates.length} candidates, ${demoJobs.length} jobs`);
  console.log(`Replacement notes planned: ${planned.length}`);
  await deleteOldDemoEvents(events);
  if (execute) await writeItems(planned);
  console.log(execute ? 'Done.' : 'Dry run complete. Re-run with --execute to replace the original Demo seed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
