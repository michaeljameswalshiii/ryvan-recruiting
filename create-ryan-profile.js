const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { hashSync, genSaltSync } = require('bcryptjs');

const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined
});

async function main() {
  const email = 'Ryan@ryvanrecruiting.com';
  const password = 'Trio@2026';
  const userId = 'b498a438-8041-7016-f5ee-c4eb3aa4dab5';
  
  // First, find or create tenant for RYVAN Recruiting
  const tenantsTable = 'turnkey-tenants';
  const profilesTable = 'turnkey-profiles';
  
  // Check if tenant exists
  const tenantScan = await client.send(new ScanCommand({
    TableName: tenantsTable,
    FilterExpression: 'contains(#name, :name)',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: { ':name': { S: 'RYVAN' } }
  }));
  
  let tenantId = 'tenant-ryvan-2026';
  
  if (!tenantScan.Items || tenantScan.Items.length === 0) {
    // Create tenant
    console.log('Creating tenant for RYVAN Recruiting...');
    await client.send(new PutItemCommand({
      TableName: tenantsTable,
      Item: {
        id: { S: tenantId },
        name: { S: 'RYVAN' },
        subdomain: { S: 'ryvan' },
        created_at: { S: new Date().toISOString() }
      }
    }));
    console.log('Tenant created:', tenantId);
  } else {
    tenantId = tenantScan.Items[0].id.S;
    console.log('Found tenant:', tenantId);
  }
  
  // Hash password
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);
  
  console.log('Creating profile for:', email);
  console.log('User ID:', userId);
  console.log('Tenant ID:', tenantId);
  
  // Check if profile exists
  const profileResult = await client.send(new GetItemCommand({
    TableName: profilesTable,
    Key: { id: { S: userId } }
  }));
  
  if (profileResult.Item) {
    console.log('Profile exists, updating password...');
    await client.send(new UpdateItemCommand({
      TableName: profilesTable,
      Key: { id: { S: userId } },
      UpdateExpression: 'SET password_hash = :hash',
      ExpressionAttributeValues: {
        ':hash': { S: hash }
      }
    }));
    console.log('Password updated!');
  } else {
    console.log('Creating new profile...');
    await client.send(new PutItemCommand({
      TableName: profilesTable,
      Item: {
        id: { S: userId },
        tenant_id: { S: tenantId },
        email: { S: email },
        full_name: { S: 'Ryan' },
        role: { S: 'admin' },
        password_hash: { S: hash },
        created_at: { S: new Date().toISOString() }
      }
    }));
    console.log('Profile created with password!');
  }
  
  console.log('\nDone! Ryan can now log in with password: Trio@2026');
}

main().catch(console.error);
