/**
 * Backfill created_at on existing demo tenant records so YTD charts
 * show a curve instead of a single-day spike.
 *
 *   node scripts/spread-demo-created-at.mjs --dry-run
 *   node scripts/spread-demo-created-at.mjs --execute
 */
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const DEMO_TENANT = 'tenant-1784069675716-demo';
const TABLES = {
  clients: process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients',
  leads: process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads',
  jobs: process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs',
};

const execute = process.argv.includes('--execute');
const client = new DynamoDBClient({ region: REGION });

function spreadCreatedAt(index, total, nowMs = Date.now()) {
  const yearStart = new Date(new Date(nowMs).getFullYear(), 0, 1).getTime();
  const span = Math.max(nowMs - yearStart, 14 * 86400000);
  const u = (index + 0.5) / Math.max(total, 1);
  const biased = Math.pow(u, 0.6);
  const d = new Date(yearStart + biased * span);
  d.setHours(8 + ((index * 7) % 10), (index * 13) % 60, (index * 17) % 60, 0);
  if (d.getTime() > nowMs) {
    d.setTime(nowMs - ((index % 12) + 1) * 3600000);
  }
  return d.toISOString();
}

async function scanAll(tableName) {
  const items = [];
  let start;
  do {
    const r = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'tenant_id = :tid',
        ExpressionAttributeValues: { ':tid': { S: DEMO_TENANT } },
        ExclusiveStartKey: start,
      })
    );
    for (const it of r.Items || []) items.push(unmarshall(it));
    start = r.LastEvaluatedKey;
  } while (start);
  return items;
}

async function updateCreatedAt(tableName, row, createdAt) {
  await client.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ tenant_id: row.tenant_id, id: row.id }),
      UpdateExpression: 'SET created_at = :c, createdAt = :c',
      ExpressionAttributeValues: marshall({ ':c': createdAt }),
    })
  );
}

async function main() {
  console.log(execute ? 'MODE: EXECUTE' : 'MODE: dry-run');
  console.log('Demo tenant:', DEMO_TENANT);

  for (const [label, table] of [
    ['clients', TABLES.clients],
    ['leads', TABLES.leads],
    ['jobs', TABLES.jobs],
  ]) {
    const rows = (await scanAll(table)).filter((r) => r.id);
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    console.log(`\n${label}: ${rows.length}`);
    for (let i = 0; i < rows.length; i++) {
      const next = spreadCreatedAt(i, rows.length);
      if (i < 3 || i === rows.length - 1) {
        console.log(`  ${rows[i].name || rows[i].title || rows[i].id}  ${rows[i].created_at || rows[i].createdAt} → ${next}`);
      }
      if (execute) await updateCreatedAt(table, rows[i], next);
    }
  }

  if (!execute) {
    console.log('\n[DRY RUN] No writes. Re-run with --execute to apply.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
