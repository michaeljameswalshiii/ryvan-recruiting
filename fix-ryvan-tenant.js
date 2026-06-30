/**
 * Fix RyVan pipeline items to use correct tenant-2024-001
 * 
 * RyVan has some data on tenant-1778593443269-u7u7dp4jo which should be tenant-2024-001
 */

const { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

const RYVAN_OLD_TENANT = 'tenant-1778593443269-u7u7dp4jo';
const NEW_TENANT = 'tenant-2024-001';

async function migrateRyvanPipeline() {
  console.log('\n=== Fixing RyVan Pipeline ===');
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-pipeline',
    FilterExpression: 'tenant_id = :oldTenant',
    ExpressionAttributeValues: {
      ':oldTenant': { S: RYVAN_OLD_TENANT }
    }
  }));
  
  console.log(`Found ${result.Items?.length || 0} pipeline items to fix`);
  
  for (const item of result.Items || []) {
    const id = item.id.S;
    const currentTenant = item.tenant_id.S;
    
    const itemData = unmarshall(item);
    delete itemData.tenant_id;
    
    await client.send(new PutItemCommand({
      TableName: 'turnkey-pipeline',
      Item: {
        ...marshall(itemData),
        tenant_id: { S: NEW_TENANT }
      }
    }));
    
    await client.send(new DeleteItemCommand({
      TableName: 'turnkey-pipeline',
      Key: { id: { S: id }, tenant_id: { S: currentTenant } }
    }));
    
    console.log(`  - Fixed pipeline: ${itemData.name || id} (${itemData.email})`);
  }
}

async function main() {
  console.log('=== Fixing RyVan tenant ===');
  console.log(`Old tenant: ${RYVAN_OLD_TENANT}`);
  console.log(`New tenant: ${NEW_TENANT}`);
  
  const proceed = process.argv.includes('--confirm');
  if (!proceed) {
    console.log('\n⚠️  Dry run. Add --confirm to apply.');
    return;
  }
  
  await migrateRyvanPipeline();
  console.log('\n=== Done ===');
}

main().catch(console.error);
