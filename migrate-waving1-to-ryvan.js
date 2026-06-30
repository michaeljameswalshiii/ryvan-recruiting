/**
 * Migrate waving1 user and all their data to RyVan's tenant
 * 
 * Since tenant_id is part of the key for pipeline/jobs tables, we need to:
 * 1. Delete the old item
 * 2. Create a new item with the same data but new tenant_id
 */

const { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

// Tenants
const OLD_TENANT = 'tenant-54f83438-e061-704d-ffc1-6f7a0f5f5346'; // waving1's current tenant
const NEW_TENANT = 'tenant-2024-001'; // RyVan's tenant

async function migratePipeline() {
  console.log('\n=== Migrating Pipeline ===');
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-pipeline',
    FilterExpression: 'tenant_id = :oldTenant',
    ExpressionAttributeValues: {
      ':oldTenant': { S: OLD_TENANT }
    }
  }));
  
  console.log(`Found ${result.Items?.length || 0} pipeline items to migrate`);
  
  for (const item of result.Items || []) {
    const id = item.id.S;
    const currentTenant = item.tenant_id.S;
    
    // Get the full item data
    const itemData = unmarshall(item);
    delete itemData.tenant_id; // Remove old tenant_id
    
    // Create new item with new tenant_id
    await client.send(new PutItemCommand({
      TableName: 'turnkey-pipeline',
      Item: {
        ...marshall(itemData),
        tenant_id: { S: NEW_TENANT }
      }
    }));
    
    // Delete old item
    await client.send(new DeleteItemCommand({
      TableName: 'turnkey-pipeline',
      Key: { id: { S: id }, tenant_id: { S: currentTenant } }
    }));
    
    console.log(`  - Migrated pipeline: ${itemData.name || id}`);
  }
}

async function migrateLeads() {
  console.log('\n=== Migrating Leads ===');
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-leads',
    FilterExpression: 'tenant_id = :oldTenant',
    ExpressionAttributeValues: {
      ':oldTenant': { S: OLD_TENANT }
    }
  }));
  
  console.log(`Found ${result.Items?.length || 0} leads to migrate`);
  
  for (const item of result.Items || []) {
    const id = item.id.S;
    const currentTenant = item.tenant_id.S;
    
    // Get the full item data
    const itemData = unmarshall(item);
    delete itemData.tenant_id;
    
    // Create new item with new tenant_id
    await client.send(new PutItemCommand({
      TableName: 'turnkey-leads',
      Item: {
        ...marshall(itemData),
        tenant_id: { S: NEW_TENANT }
      }
    }));
    
    // Delete old item
    await client.send(new DeleteItemCommand({
      TableName: 'turnkey-leads',
      Key: { id: { S: id }, tenant_id: { S: currentTenant } }
    }));
    
    console.log(`  - Migrated lead: ${itemData.name || id}`);
  }
}

async function migrateJobs() {
  console.log('\n=== Migrating Jobs ===');
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-jobs',
    FilterExpression: 'tenant_id = :oldTenant',
    ExpressionAttributeValues: {
      ':oldTenant': { S: OLD_TENANT }
    }
  }));
  
  console.log(`Found ${result.Items?.length || 0} jobs to migrate`);
  
  for (const item of result.Items || []) {
    const id = item.id.S;
    const currentTenant = item.tenant_id.S;
    
    // Get the full item data
    const itemData = unmarshall(item);
    delete itemData.tenant_id;
    
    // Create new item with new tenant_id
    await client.send(new PutItemCommand({
      TableName: 'turnkey-jobs',
      Item: {
        ...marshall(itemData),
        tenant_id: { S: NEW_TENANT }
      }
    }));
    
    // Delete old item
    await client.send(new DeleteItemCommand({
      TableName: 'turnkey-jobs',
      Key: { id: { S: id }, tenant_id: { S: currentTenant } }
    }));
    
    console.log(`  - Migrated job: ${itemData.title || id}`);
  }
}

async function migrateClients() {
  console.log('\n=== Migrating Clients ===');
  // First need to check the clients table structure
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-clients',
    FilterExpression: 'tenant_id = :oldTenant',
    ExpressionAttributeValues: {
      ':oldTenant': { S: OLD_TENANT }
    }
  }));
  
  console.log(`Found ${result.Items?.length || 0} clients to migrate`);
  
  for (const item of result.Items || []) {
    const id = item.id.S;
    const currentTenant = item.tenant_id.S;
    
    // Get the full item data
    const itemData = unmarshall(item);
    delete itemData.tenant_id;
    
    // Try update first - if that fails (tenant_id is in key), use delete+create
    try {
      await client.send(new UpdateItemCommand({
        TableName: 'turnkey-clients',
        Key: { id: { S: id } },
        UpdateExpression: 'SET tenant_id = :newTenant',
        ExpressionAttributeValues: {
          ':newTenant': { S: NEW_TENANT }
        }
      }));
      console.log(`  - Migrated client: ${itemData.name || id}`);
    } catch (e) {
      console.log(`  - Client uses tenant_id in key, doing delete+create: ${itemData.name || id}`);
      
      // Create new item with new tenant_id
      await client.send(new PutItemCommand({
        TableName: 'turnkey-clients',
        Item: {
          ...marshall(itemData),
          tenant_id: { S: NEW_TENANT }
        }
      }));
      
      // Delete old item
      await client.send(new DeleteItemCommand({
        TableName: 'turnkey-clients',
        Key: { id: { S: id }, tenant_id: { S: currentTenant } }
      }));
      
      console.log(`  - Migrated client: ${itemData.name || id}`);
    }
  }
}

async function createOrUpdateProfile() {
  console.log('\n=== Creating/Updating Profile ===');
  
  // Check if profile exists for waving1@gmail.com
  const scanResult = await client.send(new ScanCommand({
    TableName: 'turnkey-profiles',
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': { S: 'waving1@gmail.com' }
    }
  }));
  
  if (scanResult.Items && scanResult.Items.length > 0) {
    // Update existing profile
    const profile = scanResult.Items[0];
    const id = profile.id.S;
    console.log(`Profile found: ${id}, updating tenant...`);
    
    await client.send(new UpdateItemCommand({
      TableName: 'turnkey-profiles',
      Key: { id: { S: id } },
      UpdateExpression: 'SET tenant_id = :newTenant',
      ExpressionAttributeValues: {
        ':newTenant': { S: NEW_TENANT }
      }
    }));
    console.log(`  - Profile updated successfully`);
  } else {
    // Create new profile for waving1
    console.log('No profile found, creating new one...');
    const profileId = `user-waving1-${Date.now()}`;
    
    await client.send(new PutItemCommand({
      TableName: 'turnkey-profiles',
      Item: {
        id: { S: profileId },
        tenant_id: { S: NEW_TENANT },
        email: { S: 'waving1@gmail.com' },
        full_name: { S: 'w' },
        role: { S: 'user' },
        created_at: { S: new Date().toISOString() }
      }
    }));
    console.log(`  - Profile created: ${profileId}`);
  }
}

async function main() {
  console.log('=== Migrating waving1 to RyVan tenant ===');
  console.log(`Old tenant: ${OLD_TENANT}`);
  console.log(`New tenant: ${NEW_TENANT}`);
  
  const proceed = process.argv.includes('--confirm');
  if (!proceed) {
    console.log('\n⚠️  Dry run only. Add --confirm to actually migrate.');
    console.log('Run with --confirm to apply changes.');
    return;
  }
  
  console.log('\n⚠️  MIGRATION STARTING - This will move all data!');
  
  await createOrUpdateProfile();
  await migratePipeline();
  await migrateLeads();
  await migrateJobs();
  await migrateClients();
  
  console.log('\n=== Migration Complete ===');
  console.log('All data has been migrated to RyVan tenant.');
}

main().catch(console.error);
