/**
 * Update profile tenant_id
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function main() {
  const profileId = '54f87418-c021-70c1-0393-c8c47cd21cc3'; // waving1@gmail.com
  const newTenantId = 'tenant-2024-001';
  
  const result = await client.send(new UpdateCommand({
    TableName: 'turnkey-profiles',
    Key: { id: profileId },
    UpdateExpression: 'set tenant_id = :tid',
    ExpressionAttributeValues: {
      ':tid': newTenantId
    },
    ReturnValues: 'ALL_NEW'
  }));
  
  console.log('Updated profile:', JSON.stringify(result.Attributes, null, 2));
  console.log('SUCCESS: Profile tenant_id is now:', newTenantId);
}

main().catch(console.error);
