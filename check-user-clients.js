/**
 * Check clients for user's tenant in DynamoDB
 */

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });

// User's tenant ID
const tenantId = "tenant-1778593443269-u7u7dp4jo";

async function checkClients() {
  console.log(`=== Checking clients for tenant: ${tenantId} ===\n`);
  
  try {
    const result = await client.send(new ScanCommand({
      TableName: "turnkey-clients",
    }));
    
    const items = result.Items ? result.Items.map(unmarshall) : [];
    console.log(`Total clients in DB: ${items.length}\n`);
    
    // Filter by user's tenant
    const userClients = items.filter(c => c.tenant_id === tenantId);
    console.log(`Clients for your tenant: ${userClients.length}\n`);
    
    if (userClients.length > 0) {
      console.log('Your companies:');
      userClients.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (id: ${c.id})`);
      });
    }
    
    // Show all clients 
    console.log('\nAll clients:');
    items.forEach((c, i) => {
      console.log(`  ${i+1}. ${c.name} (tenant: ${c.tenant_id})`);
    });
    
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

checkClients().catch(console.error);
