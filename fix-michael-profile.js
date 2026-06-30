/**
 * Fix profile for michaeljameswalshiii@gmail.com
 * 
 * This profile currently has the old tenant ID (tenant-1778593443269-u7u7dp4jo)
 * It should be tenant-2024-001
 */

const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

const PROFILE_ID = 'profile-michaeljameswalshiii@gmail.com';
const OLD_TENANT = 'tenant-1778593443269-u7u7dp4jo';
const NEW_TENANT = 'tenant-2024-001';

async function fixProfile() {
  console.log('\n=== Fixing Michael Profile ===');
  
  try {
    await client.send(new UpdateItemCommand({
      TableName: 'turnkey-profiles',
      Key: { id: { S: PROFILE_ID } },
      UpdateExpression: 'SET tenant_id = :newTenant',
      ExpressionAttributeValues: {
        ':newTenant': { S: NEW_TENANT }
      }
    }));
    console.log(`✓ Profile updated to tenant-2024-001`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

async function main() {
  console.log('=== Fixing Profile ===');
  
  const proceed = process.argv.includes('--confirm');
  if (!proceed) {
    console.log('\n⚠️  Dry run. Add --confirm to apply.');
    return;
  }
  
  await fixProfile();
  console.log('\n=== Done ===');
}

main().catch(console.error);
