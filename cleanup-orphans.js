/**
 * Clean up orphaned data from other tenants
 */

const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

const TABLES = ['turnkey-leads', 'turnkey-pipeline', 'turnkey-jobs', 'turnkey-clients'];
const ORPHAN_TENANT = 'tenant-54f8343-e061-704d-ffc1-6f7a0f5f5346';

async function cleanupOrphans() {
  console.log('\n=== Cleaning Orphaned Data ===');
  
  for (const table of TABLES) {
    try {
      const scan = await client.send(new ScanCommand({
        TableName: table,
        FilterExpression: 'tenant_id = :tenant',
        ExpressionAttributeValues: { ':tenant': { S: ORPHAN_TENANT } }
      }));
      
      if (scan.Items?.length) {
        console.log(`\nFound ${scan.Items.length} items in ${table}:`);
        for (const item of scan.Items) {
          const id = item.id?.S;
          console.log(`  - ${id}`);
          
          // Delete if confirmed
          if (process.argv.includes('--confirm')) {
            const deleteCmd = new DeleteItemCommand({
              TableName: table,
              Key: { tenant_id: { S: ORPHAN_TENANT }, id: { S: id } }
            });
            await client.send(deleteCmd);
            console.log(`    Deleted`);
          }
        }
      }
    } catch (e) {
      console.log(`Table ${table}: ${e.message}`);
    }
  }
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  console.log('=== Cleanup Orphans (Dry Run) ===');
  console.log('Add --confirm to delete');
  
  if (!confirm) {
    console.log('\n Dry run only');
  }
  
  await cleanupOrphans();
  console.log('\n=== Done ===');
}

main().catch(console.error);
