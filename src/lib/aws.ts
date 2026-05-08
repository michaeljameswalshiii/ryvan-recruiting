"use client";

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

// AWS Configuration - only use if env vars are present
const region = process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "";
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
const tenantsTable = process.env.NEXT_PUBLIC_TENANTS_TABLE || "turnkey-tenants";
const profilesTable = process.env.NEXT_PUBLIC_PROFILES_TABLE || "turnkey-profiles";
const clientsTable = process.env.NEXT_PUBLIC_CLIENTS_TABLE || "turnkey-clients";
const leadsTable = process.env.NEXT_PUBLIC_LEADS_TABLE || "turnkey-leads";
const sourcesTable = process.env.NEXT_PUBLIC_SOURCES_TABLE || "turnkey-sources";

// Check if AWS is configured
const isConfigured = !!(clientId && userPoolId);

// Lazy initialize AWS clients - only if configured
let cognitoClient: CognitoIdentityProviderClient | null = null;
let dynamoClient: DynamoDBClient | null = null;

function getCognitoClient() {
  if (!cognitoClient && isConfigured) {
    cognitoClient = new CognitoIdentityProviderClient({ region });
  }
  if (!cognitoClient) throw new Error("AWS not configured - missing COGNITO_CLIENT_ID");
  return cognitoClient;
}

function getDynamoClient() {
  if (!dynamoClient && isConfigured) {
    dynamoClient = new DynamoDBClient({ region });
  }
  if (!dynamoClient) throw new Error("AWS not configured - missing DynamoDB config");
  return dynamoClient;
}

// Auth Functions
export async function signUp(
  email: string,
  password: string,
  fullName: string
) {
  const command = new SignUpCommand({
    ClientId: clientId,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "name", Value: fullName },
    ],
  });

  const response = await getCognitoClient().send(command);
  return response;
}

export async function signIn(email: string, password: string) {
  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  const response = await getCognitoClient().send(command);
  
  // Store tokens
  if (response.AuthenticationResult) {
    localStorage.setItem(
      "accessToken",
      response.AuthenticationResult.AccessToken || ""
    );
    localStorage.setItem(
      "refreshToken",
      response.AuthenticationResult.RefreshToken || ""
    );
    localStorage.setItem(
      "idToken",
      response.AuthenticationResult.IdToken || ""
    );
  }
  
  return response;
}

export async function signOut() {
  const accessToken = localStorage.getItem("accessToken");
  if (accessToken) {
    const command = new GlobalSignOutCommand({ AccessToken: accessToken });
    await getCognitoClient().send(command);
  }
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("idToken");
}

export async function getCurrentUser() {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return null;

  const command = new GetUserCommand({ AccessToken: accessToken });
  const response = await getCognitoClient().send(command);
  return response.UserAttributes;
}

export function getAccessToken() {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}

// Database Functions
export async function getProfile(userId: string) {
  const command = new GetItemCommand({
    TableName: profilesTable,
    Key: marshall({ id: userId }),
  });
  const response = await getDynamoClient().send(command);
  return response.Item ? unmarshall(response.Item) : null;
}

// Tenant Functions
export async function getTenant(tenantId: string) {
  const command = new GetItemCommand({
    TableName: tenantsTable,
    Key: marshall({ id: tenantId }),
  });
  const response = await getDynamoClient().send(command);
  return response.Item ? unmarshall(response.Item) : null;
}

export async function createTenant(tenant: {
  id: string;
  name: string;
  subdomain: string;
}) {
  const command = new PutItemCommand({
    TableName: tenantsTable,
    Item: marshall({
      ...tenant,
      created_at: new Date().toISOString(),
    }),
  });
  await getDynamoClient().send(command);
  return tenant;
}

// Profile Functions
export async function createProfile(profile: {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
}) {
  const command = new PutItemCommand({
    TableName: profilesTable,
    Item: marshall({
      ...profile,
      created_at: new Date().toISOString(),
    }),
  });
  await getDynamoClient().send(command);
  return profile;
}

export async function getClients(tenantId: string) {
  const command = new QueryCommand({
    TableName: clientsTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: marshall({ ":tenantId": tenantId }),
  });
  const response = await getDynamoClient().send(command);
  return response.Items ? response.Items.map((item) => unmarshall(item)) : [];
}

export async function createClient(client: {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
}) {
  const command = new PutItemCommand({
    TableName: clientsTable,
    Item: marshall(client),
  });
  await getDynamoClient().send(command);
  return client;
}

export async function updateClient(
  tenantId: string,
  clientId: string,
  updates: Record<string, unknown>
) {
  const command = new UpdateItemCommand({
    TableName: clientsTable,
    Key: marshall({ tenant_id: tenantId, id: clientId }),
    UpdateExpression: "SET #name = :name, #email = :email, #phone = :phone, #company = :company",
    ExpressionAttributeNames: {
      "#name": "name",
      "#email": "email",
      "#phone": "phone",
      "#company": "company",
    },
    ExpressionAttributeValues: marshall({
      ":name": updates.name,
      ":email": updates.email,
      ":phone": updates.phone,
      ":company": updates.company,
    }),
  });
  const response = await getDynamoClient().send(command);
  return response.Attributes ? unmarshall(response.Attributes) : null;
}

export async function deleteClient(tenantId: string, clientId: string) {
  const command = new DeleteItemCommand({
    TableName: clientsTable,
    Key: marshall({ tenant_id: tenantId, id: clientId }),
  });
  await getDynamoClient().send(command);
}

export async function getLeads(tenantId: string) {
  const command = new QueryCommand({
    TableName: leadsTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: marshall({ ":tenantId": tenantId }),
  });
  const response = await getDynamoClient().send(command);
  return response.Items ? response.Items.map((item) => unmarshall(item)) : [];
}

export async function createLead(lead: {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  company?: string;
  status?: string;
  notes?: string;
}) {
  const command = new PutItemCommand({
    TableName: leadsTable,
    Item: marshall(lead),
  });
  await getDynamoClient().send(command);
  return lead;
}

export async function updateLead(
  tenantId: string,
  leadId: string,
  updates: Record<string, unknown>
) {
  const command = new UpdateItemCommand({
    TableName: leadsTable,
    Key: marshall({ tenant_id: tenantId, id: leadId }),
    UpdateExpression: "SET #name = :name, #email = :email, #company = :company, #status = :status, #notes = :notes",
    ExpressionAttributeNames: {
      "#name": "name",
      "#email": "email",
      "#company": "company",
      "#status": "status",
      "#notes": "notes",
    },
    ExpressionAttributeValues: marshall({
      ":name": updates.name,
      ":email": updates.email,
      ":company": updates.company,
      ":status": updates.status,
      ":notes": updates.notes,
    }),
  });
  const response = await getDynamoClient().send(command);
  return response.Attributes ? unmarshall(response.Attributes) : null;
}

export async function deleteLead(tenantId: string, leadId: string) {
  const command = new DeleteItemCommand({
    TableName: leadsTable,
    Key: marshall({ tenant_id: tenantId, id: leadId }),
  });
  await getDynamoClient().send(command);
}

export async function getSources(tenantId: string) {
  const command = new QueryCommand({
    TableName: sourcesTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: marshall({ ":tenantId": tenantId }),
  });
  const response = await getDynamoClient().send(command);
  return response.Items ? response.Items.map((item) => unmarshall(item)) : [];
}

export async function createSource(source: {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  url?: string;
  description?: string;
}) {
  const command = new PutItemCommand({
    TableName: sourcesTable,
    Item: marshall(source),
  });
  await getDynamoClient().send(command);
  return source;
}
