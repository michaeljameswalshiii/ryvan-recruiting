const { DynamoDBClient, GetItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { hashSync, genSaltSync } = require('bcryptjs');

const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined
});

async function main() {
  const email = process.argv[2] || 'waving1@gmail.com';
  const password = process.argv[3] || 'Nassau#94';
  
  // Hash password with bcrypt
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);
  
  console.log('Setting password for:', email);
  console.log('Hash:', hash.substring(0, 20) + '...');
  
  // Find profile by email using scan
  const profilesTable = 'turnkey-profiles';
  
  const scanResult = await client.send(new ScanCommand({
    TableName: profilesTable,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': { S: email }
    }
  }));
  
  if (!scanResult.Items || scanResult.Items.length === 0) {
    console.log('No profile found for:', email);
    return;
  }
  
  const profile = scanResult.Items[0];
  const profileId = profile.id.S;
  const tenantId = profile.tenant_id.S;
  
  console.log('Found profile ID:', profileId);
  
  // Update with password hash using proper UpdateItemCommand
  const updateResult = await client.send(new UpdateItemCommand({
    TableName: profilesTable,
    Key: {
      id: { S: profileId }
    },
    UpdateExpression: 'SET password_hash = :hash',
    ExpressionAttributeValues: {
      ':hash': { S: hash }
    },
    ReturnValues: 'ALL_OLD'
  }));
  
  console.log('Password set successfully!');
  console.log('Profile ID:', profileId);
  console.log('Tenant ID:', tenantId);
}

main().catch(console.error);
