/**
 * @deprecated AWS SDK Client Wrapper
 * 
 * ⚠️ SECURITY WARNING: This file is marked "use client" which exposes AWS SDK to the browser.
 * 
 * This file is DEPRECATED and should NOT be used for new code.
 * 
 * Instead use:
 * - Server-side auth: src/lib/server-auth.ts (httpOnly cookies)
 * - Server actions: src/lib/actions/*.ts
 * - API routes: src/app/api/data/* (with session cookie auth)
 * 
 * This file is kept for backward compatibility only.
 * 
 * @deprecated
 */
"use client";

/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 * 
 * This file is kept for legacy client-side auth.
 * 
 * FOR NEW CODE: Use server-auth.ts + server actions only.
 * 
 * This file should NEVER be imported in production.
 * If you import it, you'll get a runtime error.
 */

// ============================================================================
// PRODUCTION BLOCKER - Remove this to enable legacy mode (NOT recommended)
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'ERROR: src/lib/aws.ts is deprecated and cannot be used in production.\n' +
    'Use src/lib/server-auth.ts + server actions instead.\n' +
    'All AWS operations must be server-side only.'
  );
}
// ============================================================================

// DON'T import AWS SDK at top level - import dynamically instead
// This prevents the error during build

// AWS Configuration - only use if env vars are present
const region = typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_AWS_REGION || "us-east-1") : "us-east-1";
const userPoolId = typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "") : "";
const clientId = typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_COGNITO_CLIENT_ID || "") : "";
const tenantsTable = "turnkey-tenants";
const profilesTable = "turnkey-profiles";
const clientsTable = "turnkey-clients";
const leadsTable = "turnkey-leads";
const sourcesTable = "turnkey-sources";

// Check if AWS is configured at runtime
function isAwsConfigured() {
  if (typeof process === 'undefined') return false;
  const cid = process.env?.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const pid = process.env?.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  return !!(cid && pid);
}

function getCognitoConfig() {
  const cid = process.env?.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const pid = process.env?.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  if (!cid || !pid) {
    throw new Error("Cognito not configured. Please add NEXT_PUBLIC_COGNITO_CLIENT_ID and NEXT_PUBLIC_COGNITO_USER_POOL_ID to your environment variables.");
  }
  return { clientId: cid, userPoolId: pid, region };
}

// No-op placeholder - real functions only work when AWS is configured
export async function signUp(email: string, password: string, fullName: string) {
  if (!isAwsConfigured()) {
    throw new Error("AWS not configured. Add NEXT_PUBLIC_COGNITO_CLIENT_ID to env vars.");
  }
  
  try {
    // Dynamic import only when needed
    const { CognitoIdentityProviderClient, SignUpCommand } = await import("@aws-sdk/client-cognito-identity-provider");
    const client = new CognitoIdentityProviderClient({ region });
    const command = new SignUpCommand({
      ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "name", Value: fullName },
      ],
    });
    return await client.send(command);
  } catch (error: any) {
    // Handle specific signup errors
    if (error.name === "InvalidParameterException" || error.message?.includes("password")) {
      throw new Error("Password does not meet requirements. Use at least 6 characters.");
    } else if (error.name === "UsernameExistsException") {
      throw new Error("An account with this email already exists. Please sign in instead.");
    }
    console.error("Signup error:", error);
    throw new Error(error.message || "Registration failed. Please try again.");
  }
}

export async function signIn(email: string, password: string) {
  let config;
  try {
    config = getCognitoConfig();
  } catch (error) {
    throw new Error("Authentication system not configured. Please contact the administrator.");
  }
  
  try {
    const { CognitoIdentityProviderClient, InitiateAuthCommand } = await import("@aws-sdk/client-cognito-identity-provider");
    const client = new CognitoIdentityProviderClient({ region: config.region });
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });
    const response = await client.send(command);
    if (response.AuthenticationResult) {
      localStorage.setItem("accessToken", response.AuthenticationResult.AccessToken || "");
      localStorage.setItem("refreshToken", response.AuthenticationResult.RefreshToken || "");
      localStorage.setItem("idToken", response.AuthenticationResult.IdToken || "");
    }
    return response;
  } catch (error: any) {
    // Extract AWS error message for better user feedback
    if (error.name === "UserNotFoundException") {
      throw new Error("User does not exist. Please create an account first.");
    } else if (error.name === "NotAuthorizedException") {
      throw new Error("Incorrect username or password.");
    }
    // Re-throw with more context
    throw new Error(error.message || "Login failed. Please try again.");
  }
}

export async function signOut() {
  // Always clear localStorage first, regardless of token validity
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("idToken");
  localStorage.removeItem("tenantId");
  
  // Try to sign out from Cognito, but don't fail if token is invalid/expired
  const accessToken = localStorage.getItem("accessToken");
  if (accessToken && isAwsConfigured()) {
    try {
      const { CognitoIdentityProviderClient, GlobalSignOutCommand } = await import("@aws-sdk/client-cognito-identity-provider");
      const client = new CognitoIdentityProviderClient({ region });
      const command = new GlobalSignOutCommand({ AccessToken: accessToken });
      await client.send(command);
    } catch (error) {
      // Ignore errors - token may be expired or invalid
      console.log("Sign out from Cognito skipped:", error);
    }
  }
}

export async function getCurrentUser() {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return null;
  if (!isAwsConfigured()) return null;
  
  const { CognitoIdentityProviderClient, GetUserCommand } = await import("@aws-sdk/client-cognito-identity-provider");
  const client = new CognitoIdentityProviderClient({ region });
  const command = new GetUserCommand({ AccessToken: accessToken });
  const response = await client.send(command);
  return response.UserAttributes;
}

export function getAccessToken() {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}

async function getDynamoClient() {
  if (!isAwsConfigured()) {
    throw new Error("AWS not configured");
  }
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  return new DynamoDBClient({ region });
}

async function unmarshall(item: any) {
  const { unmarshall } = await import("@aws-sdk/util-dynamodb");
  return unmarshall(item);
}

export async function getProfile(userId: string) {
  const { GetItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new GetItemCommand({
    TableName: profilesTable,
    Key: { id: { S: userId } },
  });
  const response = await client.send(command);
  return response.Item ? await unmarshall(response.Item) : null;
}

export async function getTenant(tenantId: string) {
  const { GetItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new GetItemCommand({
    TableName: tenantsTable,
    Key: { id: { S: tenantId } },
  });
  const response = await client.send(command);
  return response.Item ? await unmarshall(response.Item) : null;
}

export async function createTenant(tenant: { id: string; name: string; subdomain: string }) {
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: tenantsTable,
    Item: {
      id: { S: tenant.id },
      name: { S: tenant.name },
      subdomain: { S: tenant.subdomain },
      created_at: { S: new Date().toISOString() },
    },
  });
  await client.send(command);
  return tenant;
}

export async function createProfile(profile: {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
}) {
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: profilesTable,
    Item: {
      id: { S: profile.id },
      tenant_id: { S: profile.tenant_id },
      email: { S: profile.email },
      full_name: { S: profile.full_name },
      role: { S: profile.role },
      created_at: { S: new Date().toISOString() },
    },
  });
  await client.send(command);
  return profile;
}

export async function getClients(tenantId: string) {
  const { QueryCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new QueryCommand({
    TableName: clientsTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: { ":tenantId": { S: tenantId } },
  });
  const response = await client.send(command);
  return response.Items ? Promise.all(response.Items.map(unmarshall)) : [];
}

export async function createClient(client: {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
}) {
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const dbClient = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: clientsTable,
    Item: {
      id: { S: client.id },
      tenant_id: { S: client.tenant_id },
      name: { S: client.name },
      email: { S: client.email },
      phone: { S: client.phone || "" },
      company: { S: client.company || "" },
    },
  });
  await dbClient.send(command);
  return client;
}

export async function updateClient(
  tenantId: string,
  clientId: string,
  updates: Record<string, unknown>
) {
  const { UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new UpdateItemCommand({
    TableName: clientsTable,
    Key: { tenant_id: { S: tenantId }, id: { S: clientId } },
    UpdateExpression: "SET #name = :name, #email = :email, #phone = :phone, #company = :company",
    ExpressionAttributeNames: {
      "#name": "name",
      "#email": "email",
      "#phone": "phone",
      "#company": "company",
    },
    ExpressionAttributeValues: {
      ":name": { S: updates.name as string },
      ":email": { S: updates.email as string },
      ":phone": { S: updates.phone as string },
      ":company": { S: updates.company as string },
    },
  });
  const response = await client.send(command);
  return response.Attributes ? await unmarshall(response.Attributes) : null;
}

export async function deleteClient(tenantId: string, clientId: string) {
  const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new DeleteItemCommand({
    TableName: clientsTable,
    Key: { tenant_id: { S: tenantId }, id: { S: clientId } },
  });
  await client.send(command);
}

export async function getLeads(tenantId: string) {
  const { QueryCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new QueryCommand({
    TableName: leadsTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: { ":tenantId": { S: tenantId } },
  });
  const response = await client.send(command);
  return response.Items ? Promise.all(response.Items.map(unmarshall)) : [];
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
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: leadsTable,
    Item: {
      id: { S: lead.id },
      tenant_id: { S: lead.tenant_id },
      name: { S: lead.name },
      email: { S: lead.email },
      company: { S: lead.company || "" },
status: { S: lead.status || "identification" },
      notes: { S: lead.notes || "" },
    },
  });
  await client.send(command);
  return lead;
}

export async function updateLead(
  tenantId: string,
  leadId: string,
  updates: Record<string, unknown>
) {
  const { UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new UpdateItemCommand({
    TableName: leadsTable,
    Key: { tenant_id: { S: tenantId }, id: { S: leadId } },
    UpdateExpression: "SET #name = :name, #email = :email, #company = :company, #status = :status, #notes = :notes",
    ExpressionAttributeNames: {
      "#name": "name",
      "#email": "email",
      "#company": "company",
      "#status": "status",
      "#notes": "notes",
    },
    ExpressionAttributeValues: {
      ":name": { S: updates.name as string },
      ":email": { S: updates.email as string },
      ":company": { S: updates.company as string },
      ":status": { S: updates.status as string },
      ":notes": { S: updates.notes as string },
    },
  });
  const response = await client.send(command);
  return response.Attributes ? await unmarshall(response.Attributes) : null;
}

export async function deleteLead(tenantId: string, leadId: string) {
  const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new DeleteItemCommand({
    TableName: leadsTable,
    Key: { tenant_id: { S: tenantId }, id: { S: leadId } },
  });
  await client.send(command);
}

export async function getSources(tenantId: string) {
  const { QueryCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new QueryCommand({
    TableName: sourcesTable,
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: { ":tenantId": { S: tenantId } },
  });
  const response = await client.send(command);
  return response.Items ? Promise.all(response.Items.map(unmarshall)) : [];
}

export async function createSource(source: {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  url?: string;
  description?: string;
}) {
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: sourcesTable,
    Item: {
      id: { S: source.id },
      tenant_id: { S: source.tenant_id },
      name: { S: source.name },
      type: { S: source.type },
      url: { S: source.url || "" },
      description: { S: source.description || "" },
    },
  });
  await client.send(command);
  return source;
}

// Pipeline operations
export async function getPipeline(tenantId: string, pipelineId: string) {
  const { GetItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new GetItemCommand({
    TableName: "turnkey-pipeline",
    Key: { tenant_id: { S: tenantId }, id: { S: pipelineId } },
  });
  const response = await client.send(command);
  return response.Item ? await unmarshall(response.Item) : null;
}

export async function getPipelines(tenantId: string) {
  const { QueryCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new QueryCommand({
    TableName: "turnkey-pipeline",
    KeyConditionExpression: "tenant_id = :tenantId",
    ExpressionAttributeValues: { ":tenantId": { S: tenantId } },
  });
  const response = await client.send(command);
  return response.Items ? Promise.all(response.Items.map(unmarshall)) : [];
}

export async function createPipeline(pipeline: {
  id: string;
  tenant_id: string;
  name: string;
  candidateName?: string;
  candidateEmail?: string;
  stage: string;
  notes?: string;
}) {
  const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new PutItemCommand({
    TableName: "turnkey-pipeline",
    Item: {
      id: { S: pipeline.id },
      tenant_id: { S: pipeline.tenant_id },
      name: { S: pipeline.name },
      candidateName: { S: pipeline.candidateName || "" },
      candidateEmail: { S: pipeline.candidateEmail || "" },
      stage: { S: pipeline.stage },
      notes: { S: pipeline.notes || "" },
    },
  });
  await client.send(command);
  return pipeline;
}

export async function updatePipeline(
  tenantId: string,
  pipelineId: string,
  updates: Record<string, unknown>
) {
  const { UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new UpdateItemCommand({
    TableName: "turnkey-pipeline",
    Key: { tenant_id: { S: tenantId }, id: { S: pipelineId } },
    UpdateExpression: "SET #name = :name, #candidateName = :candidateName, #candidateEmail = :candidateEmail, #stage = :stage, #notes = :notes",
    ExpressionAttributeNames: {
      "#name": "name",
      "#candidateName": "candidateName",
      "#candidateEmail": "candidateEmail",
      "#stage": "stage",
      "#notes": "notes",
    },
    ExpressionAttributeValues: {
      ":name": { S: updates.name as string },
      ":candidateName": { S: updates.candidateName as string },
      ":candidateEmail": { S: updates.candidateEmail as string },
      ":stage": { S: updates.stage as string },
      ":notes": { S: updates.notes as string },
    },
  });
  const response = await client.send(command);
  return response.Attributes ? await unmarshall(response.Attributes) : null;
}

export async function deletePipeline(tenantId: string, pipelineId: string) {
  const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
  const client = await getDynamoClient();
  const command = new DeleteItemCommand({
    TableName: "turnkey-pipeline",
    Key: { tenant_id: { S: tenantId }, id: { S: pipelineId } },
  });
  await client.send(command);
}
