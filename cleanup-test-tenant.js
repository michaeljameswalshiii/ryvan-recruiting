/**
 * Clean up data from test tenant
 */

const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

const TABLES = ['turnkey-leads', 'turnkey-pipeline', 'turnkey-jobs', 'turnkey-clients'];
const TEST_TENANT = 'tenant-1778594705221';

async function cleanupTest() {
  console.log('\n=== Cleaning Test Tenant Data ===');
  
  for (const table of TABLES) {
    try {
      const scan = await client.send(new ScanCommand({
        TableName: table,
        FilterExpression: 'tenant_id = :tenant',
        ExpressionAttributeValues: { ':tenant': { S: TEST_TENANT } }
      }));
      
      if (scan.Items?.length) {
        console.log(`\nFound ${scan.Items.length} items in ${table}:`);
        for (const item of scan.Items) {
          const id = item.id?.S;
          console.log(`  - ${id}`);
          
          if (process.argv.includes('--confirm')) {
            const deleteCmd = new DeleteItemCommand({
              TableName: table,
              Key: { tenant_id: { S: TEST_TENANT }, id: { S: id } }
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
  console.log('=== Cleanup Test Tenant ===');
  console.log(`Target: ${TEST_TENANT}`);
  console.log(`Mode: ${confirm ? 'CONFIRM' : 'DRY RUN'}`);
  
  await cleanupTest();
  console.log('\n=== Done ===');
}

main().catch(console.error);
