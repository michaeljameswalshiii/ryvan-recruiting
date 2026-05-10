/**
 * Server-Side Authentication
 * 
 * Session management utilities for httpOnly cookies.
 * This runs ONLY on the server - never exposed to client.
 * 
 * NOTE: We use GetUserCommand for token validation - it's simple and reliable
 * for checking if a token is valid. Later, consider switching to aws-jwt-verify
 * for faster local JWT validation without Cognito API call.
 * 
 * For registerUser: In production, you'd use AdminGetUserCommand after confirmation
 * or a Lambda trigger to get the actual sub. For now we use UserSub from signup response.
 * 
 * @serverOnly
 */

import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, GetUserCommand, InitiateAuthCommand, GlobalSignOutCommand, SignUpCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

// AWS Configuration - server-side ONLY (NOT NEXT_PUBLIC_*)
const region = process.env.AWS_REGION || 'us-east-1';
const userPoolId = process.env.COGNITO_USER_POOL_ID!;
const clientId = process.env.COGNITO_CLIENT_ID!;

// Cookie name
const SESSION_COOKIE = 'turnkey-session';

/**
 * Session data type
 */
export interface SessionData {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  tenantId: string;
}

/**
 * Cookie name export for routes
 */
export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/**
 * Get cookie options (for route handlers)
 */
export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  };
}

/**
 * Set session cookie on response (helper for route handlers)
 */
export function setSessionCookie(response: NextResponse, session: SessionData): NextResponse {
  response.cookies.set(SESSION_COOKIE, JSON.stringify(session), getCookieOptions());
  return response;
}

/**
 * Clear session cookie on response (helper for route handlers)
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

/**
 * Get current session from httpOnly cookie
 * READ-ONLY - use API routes to set/delete cookies
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    
    if (!sessionCookie?.value) {
      return null;
    }
    
    const session = JSON.parse(sessionCookie.value) as SessionData;
    
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
 * 
 * Uses GetUserCommand to verify token is still valid.
 * NOTE: Consider switching to aws-jwt-verify package for JWT-only
 * validation without Cognito API call (faster).
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
 * Try to refresh token if expired
 * Returns new tokens if successful, null otherwise
 */
export async function refreshSession(refreshToken: string): Promise<{ AccessToken: string; IdToken: string; RefreshToken: string } | null> {
  if (!refreshToken || !clientId) {
    return null;
  }
  
  try {
    const client = new CognitoIdentityProviderClient({ region });
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });
    
    const response = await client.send(authCommand);
    const result = response.AuthenticationResult;
    
    if (!result?.AccessToken || !result?.IdToken) {
      return null;
    }
    
    return {
      AccessToken: result.AccessToken,
      IdToken: result.IdToken,
      RefreshToken: result.RefreshToken || refreshToken,
    };
  } catch {
    return null;
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
 * Authenticate user with Cognito
 * Returns tokens for API route to set cookie
 */
export async function authenticateUser(email: string, password: string): Promise<{
  userId: string;
  email: string;
  tenantId: string;
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
}> {
  // Validate env vars - don't leak to client
  if (!clientId || !userPoolId) {
    throw new Error('Authentication not configured');
  }
  
  if (!email || !password) {
    throw new Error('Email and password required');
  }
  
  const client = new CognitoIdentityProviderClient({ region });
  
  // Initiate auth with USER_PASSWORD_AUTH
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
    throw new Error('Invalid credentials');
  }
  
  const { AccessToken, IdToken, RefreshToken } = authResponse.AuthenticationResult;
  
  if (!AccessToken || !IdToken || !RefreshToken) {
    throw new Error('Invalid authentication response');
  }
  
  // Use AdminGetUserCommand to get reliable user sub/ID
  let userId = '';
  let userEmail = email;
  
  try {
    const userCommand = new AdminGetUserCommand({
      Username: email,
      UserPoolId: userPoolId,
    });
    const userResponse = await client.send(userCommand);
    
    const subAttr = userResponse.UserAttributes?.find(a => a.Name === 'sub');
    const emailAttr = userResponse.UserAttributes?.find(a => a.Name === 'email');
    
    userId = subAttr?.Value || '';
    userEmail = emailAttr?.Value || email;
  } catch {
    // Fallback to GetUser if AdminGetUser not available
    try {
      const userCommand = new GetUserCommand({ AccessToken });
      const userResponse = await client.send(userCommand);
      
      const subAttr = userResponse.UserAttributes?.find(a => a.Name === 'sub');
      const emailAttr = userResponse.UserAttributes?.find(a => a.Name === 'email');
      
      userId = subAttr?.Value || '';
      userEmail = emailAttr?.Value || email;
    } catch (err) {
      console.error('Failed to get user details:', err);
    }
  }
  
  // Get tenant from profile
  let tenantId = '';
  if (userId) {
    try {
      const dynamoClient = new DynamoDBClient({ region });
      const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';
      
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
 * Sign out from Cognito
 * Clears the token on server side - cookie cleared by route handler
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
    // Log but don't throw - token may already be invalid
    console.log('Cognito sign out skipped:', err);
  }
}

/**
 * Register new user
 * 
 * Creates tenant + profile in DynamoDB.
 * 
 * NOTE: In production, Cognito requires email verification before 
 * the user can sign in. We use UserSub from the signup response
 * as a temporary userId. A cleaner approach would be
 * to use a Lambda trigger that runs on post-confirmation
 * to write the profile with the real sub.
 */
export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  tenantName: string,
  subdomain: string
): Promise<{ userId: string; tenantId: string }> {
  if (!clientId || !userPoolId) {
    throw new Error('Authentication not configured');
  }
  
  if (!email || !password || !tenantName) {
    throw new Error('All fields required');
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
  
  const signupResponse = await cognitoClient.send(signUpCommand);
  
// Get the actual userId (sub) from Cognito
  // Use UserSub from signup response - this is the Cognito user ID
  let userId = signupResponse.UserSub || '';
  
  // CRITICAL: Never use email as userId - this is a security issue
  // If UserSub is missing, the signup failed
  if (!userId) {
    throw new Error('Failed to create user: Cognito did not return user ID');
  }
  
  // Generate tenant ID
  const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  
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
  
  // Create profile linked to user
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
