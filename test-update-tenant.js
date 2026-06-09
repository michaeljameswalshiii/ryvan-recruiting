const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

// Ryan's tenant
const RYAN_TENANT = "tenant-2024-001";

// User to update (waving1@gmail.com's user sub from earlier check)
const USER_ID = "54f87418-c021-70c1-0393-c8c47cd21cc3";

async function updateTenant() {
  console.log(`Updating tenant for user: ${USER_ID}`);
  console.log(`New tenant: ${RYAN_TENANT}`);
  console.log("---");

  const response = await client.send(new UpdateItemCommand({
    TableName: "turnkey-profiles",
    Key: { id: { S: USER_ID } },
    UpdateExpression: "SET tenant_id = :tenantId",
    ExpressionAttributeValues: { ":tenantId": { S: RYAN_TENANT } },
    ReturnValues: "ALL_NEW",
  }));

  console.log("✅ Tenant updated!");
  console.log("New profile:", JSON.stringify(response.Attributes, null, 2));
}

updateTenant().catch(console.error);
