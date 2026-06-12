// scripts/migrate-stages.mjs
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

dotenv.config();

const docClient = DynamoDBDocument.from(new DynamoDB({ region: 'us-east-1' }));
const TABLE_NAME = 'turnkey-leads';

async function migrateStages(dryRun = false) {
  console.log(`Starting stage migration... ${dryRun ? '(DRY RUN)' : ''}`);

  let lastEvaluatedKey = undefined;
  let processed = 0;
  let updated = 0;

  do {
    const result = await docClient.scan({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 25, // Smaller batches = safer
    });

    for (const candidate of result.Items || []) {
      processed++;

      if (!candidate.linkedJobs || candidate.linkedJobs.length === 0) {
        continue;
      }

      let needsUpdate = false;

      const updatedLinkedJobs = candidate.linkedJobs.map((job) => {
        // If job already has a proper stage → skip
        if (job.stage && typeof job.stage === 'string') {
          return job;
        }

        // Otherwise, map old candidate.stage to new job.stage
        const oldStage = candidate.stage || 'sourced';
        const newStage = mapOldStageToNew(oldStage);

        needsUpdate = true;
        return {
          ...job,
          stage: newStage,
          stageUpdatedAt: new Date().toISOString(),
          stageUpdatedBy: 'migration-script'
        };
      });

      if (needsUpdate) {
        if (!dryRun) {
          await docClient.put({
            TableName: TABLE_NAME,
            Item: {
              ...candidate,
              linkedJobs: updatedLinkedJobs,
              stage: undefined // Remove old top-level stage
            }
          });
          updated++;
          console.log(`Updated: ${candidate.id}`);
        } else {
          console.log(`Would update: ${candidate.id}`);
        }
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Migration complete! Processed: ${processed}, Updated: ${updated}`);
}

// Simple mapping from old stages to new ones
function mapOldStageToNew(oldStage) {
  const mapping = {
    "identification": "sourced",
    "attempted_outreach": "left_message",
    "conversation": "contacted",
    "candidate_presented": "submitted",
    "interview": "interviewing",
    "accept": "offer_accepted",
    "rejected": "rejected",
    "sourced": "sourced",
    "left_message": "left_message",
    "text": "text",
    "email": "email",
    "other": "other",
    "contacted": "contacted",
    "pre_screened": "pre_screened",
    "submitted": "submitted",
    "interviewing": "interviewing",
    "offer_out": "offer_out",
    "offer_accepted": "offer_accepted",
    "offer_declined": "offer_declined",
    "placed": "placed",
  };

  return mapping[oldStage?.toLowerCase()] || "sourced";
}

// Run it
const isDryRun = process.argv.includes('--dry-run');
migrateStages(isDryRun).catch(console.error);
