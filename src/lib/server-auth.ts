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
import { CognitoIdentityProviderClient, GetUserCommand, InitiateAuthCommand, RespondToAuthChallengeCommand, GlobalSignOutCommand, SignUpCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import {
  SESSION_COOKIE_NAME,
  sealSession,
  unsealSession,
  sessionCookieOptions,
} from '@/lib/session-seal';
import { isSiteAdmin } from '@/lib/roles';

// AWS Configuration - server-side
// Support both server-only vars (local) and NEXT_PUBLIC_ vars (Vercel deployment)
// Using non-null assertion with fallback to prefixed versions for Vercel compatibility
const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
const clientId = process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';

// Credentials for server-side AWS calls (required on Vercel)
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

// Debug logging for credentials (remove in production)
function debugCredentials() {
  console.log('[DEBUG] AWS Access Key ID set:', !!awsAccessKeyId, awsAccessKeyId ? `${awsAccessKeyId.substring(0, 4)}...` : 'undefined');
  console.log('[DEBUG] AWS Secret Access Key set:', !!awsSecretAccessKey, awsSecretAccessKey ? '***hidden***' : 'undefined');
}

function getAwsCredentials() {
  debugCredentials();
  
  if (awsAccessKeyId && awsSecretAccessKey) {
    return {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    };
  }
  
  console.log('[DEBUG] getAwsCredentials() returning undefined - credentials not found');
  return undefined;
}

// Cookie name (sealed JWE — see session-seal.ts)
const SESSION_COOKIE = SESSION_COOKIE_NAME;

/**
 * Session data type
 * Cookie is an encrypted JWE (jose). Tokens are included when they fit size limits.
 */
export interface SessionData {
  userId: string;
  email: string;
  tenantId: string;
  /** Site Admin acting scope: "all" or a validated tenant id. */
  tenantScope?: string;
  /** Canonical role: site_admin | company_admin | user */
  role?: string;
  accessToken?: string;
  refreshToken: string;
}

/**
 * In-memory token cache for server-side storage
 * Maps session key to full tokens
 */
const tokenCache = new Map<string, { accessToken: string; idToken: string; refreshToken: string }>();

export function cacheTokens(sessionKey: string, tokens: { AccessToken: string; IdToken: string; RefreshToken: string }) {
  tokenCache.set(sessionKey, {
    accessToken: tokens.AccessToken,
    idToken: tokens.IdToken,
    refreshToken: tokens.RefreshToken,
  });
}

export function getCachedTokens(sessionKey: string) {
  return tokenCache.get(sessionKey) || null;
}

export function clearCachedTokens(sessionKey: string) {
  tokenCache.delete(sessionKey);
}

/**
 * Cookie name export for routes
 */
export { SESSION_COOKIE_NAME };

/**
 * Get cookie options (for route handlers)
 */
export function getCookieOptions() {
  return sessionCookieOptions();
}

/**
 * Set sealed session cookie on response (helper for route handlers)
 */
export async function setSessionCookie(
  response: NextResponse,
  session: SessionData
): Promise<NextResponse> {
  const role = session.role;
  // Site admins: home tenant is always platform; scope defaults to All Tenants
  let tenantId = session.tenantId;
  let tenantScope = session.tenantScope;
  if (isSiteAdmin(role)) {
    try {
      const {
        ensurePlatformTenant,
        PLATFORM_TENANT_ID,
      } = await import('@/lib/platform-tenant');
      await ensurePlatformTenant();
      tenantId = PLATFORM_TENANT_ID;
    } catch (e) {
      console.warn('[setSessionCookie] platform tenant ensure failed:', e);
    }
    if (!tenantScope) tenantScope = 'all';
  }

  const sealed = await sealSession({
    userId: session.userId,
    email: session.email,
    tenantId,
    tenantScope:
      tenantScope || (isSiteAdmin(role) ? 'all' : undefined),
    role: session.role,
    accessToken: session.accessToken || '',
    refreshToken: session.refreshToken || '',
  });
  response.cookies.set(SESSION_COOKIE, sealed, getCookieOptions());
  return response;
}

/**
 * Clear session cookie on response (helper for route handlers)
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, '', {
    ...getCookieOptions(),
    maxAge: 0,
  });
  return response;
}

/**
 * Get verified session from sealed httpOnly cookie.
 * Rejects tampered, expired, and legacy plain-JSON cookies.
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);

    if (!sessionCookie?.value) {
      return null;
    }

    const sealed = await unsealSession(sessionCookie.value);
    if (!sealed?.userId) {
      return null;
    }

    return {
      userId: sealed.userId,
      email: sealed.email,
      tenantId: sealed.tenantId,
      tenantScope: sealed.tenantScope,
      role: sealed.role,
      accessToken: sealed.accessToken || '',
      refreshToken: sealed.refreshToken || '',
    };
  } catch (error) {
    console.error('[getSession] Error:', error);
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
    const client = new CognitoIdentityProviderClient({ region, credentials: getAwsCredentials() });
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
    const client = new CognitoIdentityProviderClient({ region, credentials: getAwsCredentials() });
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
  if (!session) return null;
  if (isSiteAdmin(session.role)) {
    if (!session.tenantScope || session.tenantScope === 'all') return null;
    if (session.tenantScope) return session.tenantScope;
  }
  return session.tenantId || null;
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
export type CognitoAuthSuccess = {
  kind: 'success';
  userId: string;
  email: string;
  tenantId: string;
  role?: string;
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
};

/** Cognito MFA challenge — client must call /api/auth/mfa/verify */
export type CognitoAuthMfaChallenge = {
  kind: 'mfa_required';
  challengeName: string;
  session: string;
  email: string;
  /** Cognito username (often email) */
  username: string;
};

export type CognitoAuthResult = CognitoAuthSuccess | CognitoAuthMfaChallenge;

async function loadProfileTenantRole(userId: string): Promise<{
  tenantId: string;
  role: string;
}> {
  let tenantId = '';
  let role = 'user';
  if (!userId) return { tenantId, role };
  try {
    const dynamoClient = new DynamoDBClient({
      region,
      credentials: getAwsCredentials(),
    });
    const profilesTable =
      process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';
    const profileCommand = new GetItemCommand({
      TableName: profilesTable,
      Key: { id: { S: userId } },
    });
    const profileResponse = await dynamoClient.send(profileCommand);
    if (profileResponse.Item) {
      const profile = unmarshall(profileResponse.Item);
      tenantId = profile.tenant_id || '';
      role = (profile.role as string) || 'user';
    }
  } catch (err) {
    console.error('Failed to get profile:', err);
  }
  return { tenantId, role };
}

async function resolveUserFromAccessToken(
  client: CognitoIdentityProviderClient,
  AccessToken: string,
  emailHint: string
): Promise<{ userId: string; userEmail: string }> {
  let userId = '';
  let userEmail = emailHint;
  try {
    const userCommand = new AdminGetUserCommand({
      Username: emailHint,
      UserPoolId: userPoolId,
    });
    const userResponse = await client.send(userCommand);
    const subAttr = userResponse.UserAttributes?.find((a) => a.Name === 'sub');
    const emailAttr = userResponse.UserAttributes?.find(
      (a) => a.Name === 'email'
    );
    userId = subAttr?.Value || '';
    userEmail = emailAttr?.Value || emailHint;
  } catch {
    try {
      const userCommand = new GetUserCommand({ AccessToken });
      const userResponse = await client.send(userCommand);
      const subAttr = userResponse.UserAttributes?.find(
        (a) => a.Name === 'sub'
      );
      const emailAttr = userResponse.UserAttributes?.find(
        (a) => a.Name === 'email'
      );
      userId = subAttr?.Value || '';
      userEmail = emailAttr?.Value || emailHint;
    } catch (err) {
      console.error('Failed to get user details:', err);
    }
  }
  return { userId, userEmail };
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<CognitoAuthResult> {
  if (!clientId || !userPoolId) {
    throw new Error('Authentication not configured');
  }

  if (!email || !password) {
    throw new Error('Email and password required');
  }

  const client = new CognitoIdentityProviderClient({
    region,
    credentials: getAwsCredentials(),
  });

  // Cognito email/username is case-sensitive — always use lowercase
  const username = email.trim().toLowerCase();

  const authCommand = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const authResponse = await client.send(authCommand);

  // MFA challenge (TOTP / SMS) — do not issue session cookie yet
  if (
    authResponse.ChallengeName &&
    (authResponse.ChallengeName === 'SOFTWARE_TOKEN_MFA' ||
      authResponse.ChallengeName === 'SMS_MFA' ||
      authResponse.ChallengeName === 'EMAIL_OTP')
  ) {
    if (!authResponse.Session) {
      throw new Error('Invalid credentials');
    }
    return {
      kind: 'mfa_required',
      challengeName: authResponse.ChallengeName,
      session: authResponse.Session,
      email: username,
      username,
    };
  }

  if (!authResponse.AuthenticationResult) {
    throw new Error('Invalid credentials');
  }

  const { AccessToken, IdToken, RefreshToken } =
    authResponse.AuthenticationResult;

  if (!AccessToken || !IdToken || !RefreshToken) {
    throw new Error('Invalid authentication response');
  }

  const { userId, userEmail } = await resolveUserFromAccessToken(
    client,
    AccessToken,
    username
  );
  const { tenantId, role } = await loadProfileTenantRole(userId);

  return {
    kind: 'success',
    userId,
    email: (userEmail || username).toLowerCase(),
    tenantId,
    role,
    AccessToken,
    IdToken,
    RefreshToken,
  };
}

/**
 * Complete Cognito MFA challenge and return full session tokens.
 */
export async function completeMfaChallenge(input: {
  email: string;
  username?: string;
  session: string;
  challengeName: string;
  code: string;
}): Promise<CognitoAuthSuccess> {
  if (!clientId || !userPoolId) {
    throw new Error('Authentication not configured');
  }
  const code = String(input.code || '').trim();
  if (!code || !input.session) {
    throw new Error('Invalid MFA code');
  }

  const client = new CognitoIdentityProviderClient({
    region,
    credentials: getAwsCredentials(),
  });

  const challengeResponses: Record<string, string> = {
    USERNAME: input.username || input.email,
  };
  if (input.challengeName === 'SOFTWARE_TOKEN_MFA') {
    challengeResponses.SOFTWARE_TOKEN_MFA_CODE = code;
  } else if (input.challengeName === 'SMS_MFA') {
    challengeResponses.SMS_MFA_CODE = code;
  } else {
    challengeResponses.SOFTWARE_TOKEN_MFA_CODE = code;
  }

  const resp = await client.send(
    new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: input.challengeName as 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA',
      Session: input.session,
      ChallengeResponses: challengeResponses,
    })
  );

  if (!resp.AuthenticationResult?.AccessToken) {
    throw new Error('Invalid MFA code');
  }

  const { AccessToken, IdToken, RefreshToken } = resp.AuthenticationResult;
  if (!AccessToken || !IdToken || !RefreshToken) {
    throw new Error('Invalid MFA response');
  }

  const { userId, userEmail } = await resolveUserFromAccessToken(
    client,
    AccessToken,
    input.email
  );
  const { tenantId, role } = await loadProfileTenantRole(userId);

  return {
    kind: 'success',
    userId,
    email: userEmail,
    tenantId,
    role,
    AccessToken,
    IdToken,
    RefreshToken,
  };
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
    const client = new CognitoIdentityProviderClient({ region, credentials: getAwsCredentials() });
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
  
const cognitoClient = new CognitoIdentityProviderClient({ region, credentials: getAwsCredentials() });
  
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
  const dynamoClient = new DynamoDBClient({ region, credentials: getAwsCredentials() });
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
      role: 'company_admin', // first user of a new tenant
      created_at: new Date().toISOString(),
    }),
  }));
  
  return { userId, tenantId };
}
