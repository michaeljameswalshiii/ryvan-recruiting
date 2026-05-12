/**
 * Test adding company directly via DynamoDB (bypasses auth)
 * Uses @aws-sdk/client-dynamodb directly
 */

const { DynamoDBClient, PutItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const tableName = "turnkey-clients";

async function testDirectDB() {
  console.log('=== Testing Direct DynamoDB Access ===\n');
  
  const testCompany = {
    tenant_id: "tenant-2024-001",
    id: "test-company-" + Date.now(),
    name: "Test Company " + Date.now(),
    domain: "testcompany.com",
    industry: "Technology",
    city: "San Francisco", 
    state: "CA",
    country: "US",
    employee_count: 100,
    revenue: "$10M-$25M",
    description: "Test company added directly to DynamoDB",
    created_at: new Date().toISOString(),
  };
  
  // Step 1: Add company directly
  console.log('[Step 1] Adding company to DynamoDB...');
  try {
    await client.send(new PutItemCommand({
      TableName: tableName,
      Item: marshall(testCompany),
    }));
    console.log('✅ Company added:', testCompany.name);
  } catch (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  // Step 2: Scan to verify
  console.log('\n[Step 2] Scanning for companies...');
  try {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "tenant_id = :tid",
      ExpressionAttributeValues: marshall({ ":tid": "tenant-2024-001" }),
    }));
    
    const items = result.Items ? result.Items.map(unmarshall) : [];
    console.log(`Found ${items.length} companies for tenant-2024-001`);
    
    if (items.length > 0) {
      items.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.city}, ${c.state})`);
      });
    }
  } catch (error) {
    console.log('❌ Error scanning:', error.message);
  }
  
  console.log('\n=== Done ===');
}

testDirectDB().catch(console.error);
