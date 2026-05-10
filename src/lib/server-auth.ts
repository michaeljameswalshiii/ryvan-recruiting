/**
 * Server-Side Authentication
 * 
 * Uses httpOnly cookies for secure session management.
 * This runs ONLY on the server - never exposed to client.
 * 
 * @serverOnly
 */

"use server";

import { cookies } from 'next/headers';
import { CognitoIdentityProviderClient, GetUserCommand, InitiateAuthCommand, GlobalSignOutCommand, SignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

// AWS Configuration - server-side only (not NEXT_PUBLIC_*)
const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
const userPoolId = process.env.COGNITO_USER_POOL_ID!;
const clientId = process.env.COGNITO_CLIENT_ID!;

// Cookie name
const SESSION_COOKIE = 'turnkey-session';

// DynamoDB tables
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

/**
 * Get current session from httpOnly cookie
 * This is READ-ONLY - use API routes to set/delete cookies
 */
export async function getSession(): Promise<{
  accessToken: string;
  idToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  tenantId: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    
    if (!sessionCookie?.value) {
      return null;
    }
    
    const session = JSON.parse(sessionCookie.value);
    
    // Validate required fields
    if (!session.accessToken || !session.userId) {
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

/**
 * Validate session token with Cognito
 */
export async function validateSession(accessToken: string): Promise<boolean> {
  if (!accessToken) {
    return false;
  }
  
  try {
    const client = new CognitoIdentityProviderClient({ region });
    const command = new GetUserCommand({ AccessToken: accessToken });
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get tenant ID from session
 */
export async function getSessionTenantId(): Promise<string | null> {
  const session = await getSession();
  return session?.tenantId || null;
}

/**
 * Get user ID from session
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId || null;
}

/**
 * Get user email from session
 */
export async function getSessionUserEmail(): Promise<string | null> {
  const session = await getSession();
  return session?.email || null;
}

/**
 * Authenticate user with Cognito (returns tokens for API route to set cookie)
 */
export async function authenticateUser(email: string, password: string): Promise<{
  userId: string;
  email: string;
  tenantId: string;
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
}> {
  // Validate env vars
  if (!clientId) {
    throw new Error('Authentication not configured');
  }
  
  const client = new CognitoIdentityProviderClient({ region });
  
  // Initiate auth
  const authCommand = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });
  
  const authResponse = await client.send(authCommand);
  
  if (!authResponse.AuthenticationResult) {
    throw new Error('Authentication failed');
  }
  
  const { AccessToken, IdToken, RefreshToken } = authResponse.AuthenticationResult;
  
  if (!AccessToken || !IdToken || !RefreshToken) {
    throw new Error('Invalid authentication response');
  }
  
  // Get user info to find userId
  const userCommand = new GetUserCommand({ AccessToken });
  const userResponse = await client.send(userCommand);
  
  const userId = userResponse.UserAttributes?.find(a => a.Name === 'sub')?.Value || '';
  const userEmail = userResponse.UserAttributes?.find(a => a.Name === 'email')?.Value || email;
  
  // Get tenant from profile
  let tenantId = '';
  if (userId) {
    try {
      const dynamoClient = new DynamoDBClient({ region });
      const profileCommand = new GetItemCommand({
        TableName: profilesTable,
        Key: { id: { S: userId } },
      });
      const profileResponse = await dynamoClient.send(profileCommand);
      
      if (profileResponse.Item) {
        const profile = unmarshall(profileResponse.Item);
        tenantId = profile.tenant_id || '';
      }
    } catch (err) {
      console.error('Failed to get profile:', err);
    }
  }
  
  return { userId, email: userEmail, tenantId, AccessToken, IdToken, RefreshToken };
}

/**
 * Sign out from Cognito (token invalidation only - cookie cleared by API route)
 */
export async function signOutFromCognito(accessToken: string): Promise<void> {
  if (!accessToken) {
    return;
  }
  
  try {
    const client = new CognitoIdentityProviderClient({ region });
    const command = new GlobalSignOutCommand({ AccessToken: accessToken });
    await client.send(command);
  } catch (err) {
    // Log error but don't throw - token may already be invalid
    console.log('Cognito sign out error:', err);
  }
}

/**
 * Register new user (returns data for API route)
 */
export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  tenantName: string,
  subdomain: string
): Promise<{ userId: string; tenantId: string }> {
  // Validate env vars
  if (!clientId) {
    throw new Error('Authentication not configured');
  }
  
  const cognitoClient = new CognitoIdentityProviderClient({ region });
  
  // Sign up with Cognito
  const signUpCommand = new SignUpCommand({
    ClientId: clientId,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: fullName },
    ],
  });
  
  await cognitoClient.send(signUpCommand);
  
  // Use email as temp userId (in production, get sub from Cognito after confirmation)
  const userId = email;
  
  // Generate tenant ID
  const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  // Create tenant in DynamoDB
  const dynamoClient = new DynamoDBClient({ region });
  const tenantsTable = process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants';
  
  await dynamoClient.send(new PutItemCommand({
    TableName: tenantsTable,
    Item: marshall({
      id: tenantId,
      name: tenantName,
      subdomain: subdomain.toLowerCase().replace(/\s+/g, '-'),
      created_at: new Date().toISOString(),
    }),
  }));
  
  // Create profile
  const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';
  await dynamoClient.send(new PutItemCommand({
    TableName: profilesTable,
    Item: marshall({
      id: userId,
      tenant_id: tenantId,
      email,
      full_name: fullName,
      role: 'admin',
      created_at: new Date().toISOString(),
    }),
  }));
  
  return { userId, tenantId };
}
