/**
 * One-shot CLI: retag AI fit events Other → AI Review
 *
 *   node scripts/backfill-ai-review.mjs           # dry run
 *   node scripts/backfill-ai-review.mjs --apply   # write
 *
 * Uses AWS_REGION + credentials from env (.env.local if dotenv available).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local if present
function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
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

loadEnvLocal();

const apply = process.argv.includes('--apply');
const region = process.env.AWS_REGION || 'us-east-1';
const table = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  })
);

function isAiFit(item) {
  const meta = item.metadata || {};
  if (meta.systemKind === 'ai_fit') return true;
  const noteText = String(meta.noteText || item.description || '');
  const title = String(item.title || '');
  if (/^ai fit for/i.test(noteText.trim())) return true;
  if (/ai fit\s*·/i.test(title) || /^ai review/i.test(title)) return true;
  if (typeof meta.fitScore === 'number') {
    if (
      /ai fit|fit score|domain\s+\d|overall\s+\d|grade\s+[a-f]/i.test(
        noteText + ' ' + title
      )
    ) {
      return true;
    }
  }
  return false;
}

function needsUpdate(item) {
  if (!isAiFit(item)) return false;
  const meta = item.metadata || {};
  return meta.noteType !== 'AI Review' || meta.noteTypeLabel !== 'AI Review';
}

async function main() {
  console.log(
    `Backfill AI Review on ${table} (${region}) — ${apply ? 'APPLY' : 'DRY RUN'}`
  );

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let startKey;

  do {
    const res = await client.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items || []) {
      if (!item.SK || !String(item.SK).startsWith('EVENT#')) continue;
      if (
        item.entityType !== 'candidate' &&
        !(item.PK && String(item.PK).startsWith('ENTITY#candidate#'))
      ) {
        continue;
      }
      scanned++;
      if (!needsUpdate(item)) continue;
      matched++;

      const meta = {
        ...(item.metadata || {}),
        noteType: 'AI Review',
        noteTypeLabel: 'AI Review',
        systemKind: (item.metadata && item.metadata.systemKind) || 'ai_fit',
        backfilledAiReviewAt: new Date().toISOString(),
      };

      let title = item.title;
      if (title && /note\s*-\s*other/i.test(title)) {
        title = title.replace(/note\s*-\s*other/i, 'Note - AI Review');
      } else if (title && /^AI fit\s*·/i.test(title)) {
        title = title.replace(/^AI fit/i, 'AI Review');
      }

      console.log(
        `  ${apply ? 'UPDATE' : 'WOULD'}: ${item.entityId} ${item.SK} (${item.metadata?.noteType || 'Other'} → AI Review)`
      );

      if (apply) {
        await client.send(
          new UpdateCommand({
            TableName: table,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: 'SET #title = :title, #metadata = :metadata',
            ExpressionAttributeNames: {
              '#title': 'title',
              '#metadata': 'metadata',
            },
            ExpressionAttributeValues: {
              ':title': title || item.title,
              ':metadata': meta,
            },
          })
        );
        updated++;
      }
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  console.log(
    `Done. candidate events scanned≈${scanned}, matched=${matched}, updated=${updated}`
  );
  if (!apply && matched > 0) {
    console.log('Re-run with --apply to write changes.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
