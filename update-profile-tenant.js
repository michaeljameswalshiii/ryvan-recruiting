/**
 * Update user profile tenant_id
 * Usage: node update-profile-tenant.js
 */

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

const client = new DynamoDBClient({ region });

async function main() {
  const email = 'waving1@gmail.com';
const newTenantId = 'tenant-1778593443269-u7u7dp4jo';
  
  console.log(`[INFO] Looking for profile with email: ${email}`);
  
  // First, find the profile by email (using scan with GSI)
  const scanResult = await client.send(new (require('@aws-sdk/client-dynamodb').ScanCommand)({
    TableName: profilesTable,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': { S: email }
    }
  }));
  
  if (!scanResult.Items || scanResult.Items.length === 0) {
    console.error('[ERROR] Profile not found for email:', email);
    process.exit(1);
  }
  
  const profile = unmarshall(scanResult.Items[0]);
  console.log('[INFO] Found profile:', profile);
  
  const userId = profile.id;
  console.log(`[INFO] User ID: ${userId}`);
  console.log(`[INFO] Current tenant_id: ${profile.tenant_id || '(none)'}`);
  
  // Update the tenant_id
  console.log(`[INFO] Updating to tenant_id: ${newTenantId}`);
  
  const updateResult = await client.send(new UpdateItemCommand({
    TableName: profilesTable,
    Key: { id: { S: userId } },
    UpdateExpression: 'SET tenant_id = :tenant_id',
    ExpressionAttributeValues: {
      ':tenant_id': { S: newTenantId }
    },
    ReturnValues: 'ALL_NEW'
  }));
  
  const updated = unmarshall(updateResult.Attributes);
  console.log('[SUCCESS] Updated profile:', updated);
  console.log(`[SUCCESS] Profile now has tenant_id: ${updated.tenant_id}`);
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
