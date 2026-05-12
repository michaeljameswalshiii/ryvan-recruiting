/**
 * Verify the added company can be queried from DynamoDB
 */

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const tableName = "turnkey-clients";

async function verifyCompanies() {
  console.log('=== Verifying Companies for Tenant ===\n');
  
  // Scan with filter (not ideal but works without index)
  const tenantId = "tenant-2024-001";
  
  console.log(`Scanning clients for tenant: ${tenantId}...`);
  
  try {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "tenant_id = :tid",
      ExpressionAttributeValues: {
        ":tid": { S: tenantId }
      },
    }));
    
    const items = result.Items ? result.Items.map(unmarshall) : [];
    console.log(`\n✅ Found ${items.length} companies:`);
    
    items.forEach((c, i) => {
      console.log(`\n  ${i+1}. ${c.name}`);
      console.log(`     - Industry: ${c.industry || 'N/A'}`);
      console.log(`     - Location: ${c.city}, ${c.state}`);
      console.log(`     - Employees: ${c.employee_count || 'N/A'}`);
      console.log(`     - Revenue: ${c.revenue || 'N/A'}`);
    });
    
    console.log('\n=== Dashboard should show Companies count: ' + items.length + ' ===');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

verifyCompanies().catch(console.error);
