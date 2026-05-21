/**
 * Migration Script: Set all leads to "identification" status
 * 
 * Usage: node scripts/migrate-all-to-identification.mjs
 * 
 * Requires AWS credentials in environment:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - DYNAMODB_LEADS_TABLE (optional, defaults to 'turnkey-leads')
 */

import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

const region = process.env.AWS_REGION || 'us-east-1';
const leadsTable = process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads';

async function migrateAllToIdentification() {
  console.log('[Migration] Starting...');
  
  const client = new DynamoDBClient({ region });
  
  // Scan all leads from all tenants
  const scanResult = await client.send(new ScanCommand({
    TableName: leadsTable,
  }));
  
  const leads = scanResult.Items?.map(item => unmarshall(item)) || [];
  console.log(`[Migration] Found ${leads.length} leads`);
  
  let updated = 0;
  let errors = 0;
  
  for (const lead of leads) {
    try {
      // Update each lead's status to "identification"
      await client.send(new UpdateItemCommand({
        TableName: leadsTable,
        Key: marshall({ tenant_id: lead.tenant_id, id: lead.id }),
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: marshall({ ':status': 'identification' }),
      }));
      updated++;
      console.log(`[Migration] Updated lead: ${lead.name || 'Unknown'} (${lead.id})`);
    } catch (err) {
      errors++;
      console.error(`[Migration] Error updating ${lead.id}:`, err.message);
    }
  }
  
  console.log(`[Migration] Complete: ${updated} updated, ${errors} errors`);
  return { updated, errors };
}

migrateAllToIdentification()
  .then(result => {
    console.log('Result:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
