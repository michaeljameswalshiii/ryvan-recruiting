/**
 * Test production DynamoDB tables
 */

const { DynamoDBClient, ListTablesCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

// Try using default credentials from environment
const client = new DynamoDBClient({ region: "us-east-1" });

async function testProductionDB() {
  console.log('=== Testing Production DynamoDB ===\n');
  
  // Step 1: List tables to see what exists
  console.log('[Step 1] Listing tables...');
  try {
    const result = await client.send(new ListTablesCommand({}));
    console.log('Tables:', result.TableNames?.join(', ') || 'None');
  } catch (e) {
    console.log('Error listing:', e.message);
  }
  
  // Step 2: Scan clients table
  console.log('\n[Step 2] Scanning turnkey-clients...');
  try {
    const result = await client.send(new ScanCommand({
      TableName: "turnkey-clients",
      Limit: 10,
    }));
    const items = result.Items ? result.Items.map(unmarshall) : [];
    console.log(`Found ${items.length} clients`);
    
    if (items.length > 0) {
      items.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (tenant: ${c.tenant_id})`);
      });
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Step 3: Scan leads table
  console.log('\n[Step 3] Scanning turnkey-leads...');
  try {
    const result = await client.send(new ScanCommand({
      TableName: "turnkey-leads",
      Limit: 10,
    }));
    const items = result.Items ? result.Items.map(unmarshall) : [];
    console.log(`Found ${items.length} leads`);
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  console.log('\n=== Done ===');
}

testProductionDB().catch(console.error);
