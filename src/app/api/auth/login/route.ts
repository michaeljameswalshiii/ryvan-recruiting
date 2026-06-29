/**
 * Auth Login API Route
 * Server-side login using httpOnly cookies
 * 
 * Falls back to simple DynamoDB auth when Cognito not configured
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/server-auth';
import { loginSchema } from '@/lib/schemas/auth';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { compareSync } from 'bcryptjs';

// Try Cognito first, fallback to simple auth
const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

// Check if Cognito is configured
const cognitoConfigured = !!(process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID) &&
  !!(process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID);

// Demo user for testing (bypasses DynamoDB when AWS creds not configured)
const DEMO_USER = {
  email: 'waving1@gmail.com',
  password: 'Nassau#94',
  userId: 'demo-user-001',
  tenantId: 'demo-tenant-001'
};

// Check if AWS credentials are available
const awsCredentialsConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

console.log('[LOGIN] Auth config - Cognito:', cognitoConfigured, 'AWS Creds:', awsCredentialsConfigured);

/**
 * Simple DynamoDB-based authentication (fallback)
 */
async function authenticateSimple(email: string, password: string) {
  // Configure DynamoDB client with credentials from environment
  const client = new DynamoDBClient({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  
  const scanResult = await client.send(new ScanCommand({
    TableName: profilesTable,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': { S: email }
    }
  }));
  
  if (!scanResult.Items || scanResult.Items.length === 0) {
    throw new Error('Invalid credentials');
  }
  
  const profile = scanResult.Items[0];
  const userId = profile.id.S;
  const tenantId = profile.tenant_id?.S;
  const storedHash = profile.password_hash?.S;
  
  if (!storedHash) {
    throw new Error('No password set for this account');
  }
  
  if (!compareSync(password, storedHash)) {
    throw new Error('Invalid credentials');
  }
  
  return {
    userId: userId || '',
    email,
    tenantId: tenantId || '',
  };
}

/**
 * POST /api/auth/login
 * Login and set session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input with Zod
    const validated = loginSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 400 }
      );
    }

const { email, password } = validated.data;

    let session: any;
    
    // Check demo user first when AWS credentials not configured
    if (!awsCredentialsConfigured) {
      console.log('[LOGIN] AWS credentials not configured, checking demo user');
      if (email === DEMO_USER.email && password === DEMO_USER.password) {
        console.log('[LOGIN] Demo user authenticated successfully');
        session = {
          userId: DEMO_USER.userId,
          email: DEMO_USER.email,
          tenantId: DEMO_USER.tenantId,
        };
      } else {
        // Demo user doesn't match - check if it's the correct demo credentials
        console.log('[LOGIN] Demo user check failed for:', email);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
} else if (cognitoConfigured && awsCredentialsConfigured) {
      // Try Cognito if configured AND credentials available
      try {
        // Dynamic import to avoid issues when Cognito not configured
        const { authenticateUser } = await import('@/lib/server-auth');
        console.log('[LOGIN] Authenticating with Cognito:', email);
        session = await authenticateUser(email, password);
      } catch (cognitoErr: any) {
        console.log('[LOGIN] Cognito auth failed, trying simple auth:', cognitoErr.message);
        session = await authenticateSimple(email, password);
      }
    } else {
      // Use simple DynamoDB auth
      console.log('[LOGIN] Using simple DynamoDB auth for:', email);
      session = await authenticateSimple(email, password);
    }

    console.log('[LOGIN] Authentication successful, userId:', session.userId);

// Create session data for cookie - include refreshToken for Cognito compatibility
    const sessionData = {
      userId: session.userId || '',
      email: session.email || '',
      tenantId: session.tenantId || '',
      accessToken: session.AccessToken || '',
      refreshToken: session.RefreshToken || '',
    };

    // Use helper to set cookie - returns response directly
    return setSessionCookie(
      NextResponse.json({ 
        success: true,
        user: {
          id: session.userId,
          email: session.email,
          tenantId: session.tenantId,
        }
      }),
      sessionData
    );
  } catch (error: unknown) {
    console.error('[LOGIN] Full error:', error);
    
    // Don't leak internal error messages
    const message = error instanceof Error ? error.message : 'Login failed';
    
    return NextResponse.json(
      { error: message },
      { status: 401 }
    );
  }
}
