/**
 * Simple Login API (DynamoDB-based)
 * Bypasses Cognito for simpler deployment
 * 
 * Uses bcrypt to verify password against stored hash in profiles table
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { compareSync } from 'bcryptjs';

const region = process.env.AWS_REGION || 'us-east-1';
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

const client = new DynamoDBClient({ region });

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }
    
    // Find profile by email
    const scanResult = await client.send(new ScanCommand({
      TableName: profilesTable,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: email }
      }
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    const profile = scanResult.Items[0];
    const profileId = profile.id.S;
    const tenantId = profile.tenant_id.S;
    const storedHash = profile.password_hash?.S;
    
    // Check if password is set
    if (!storedHash) {
      return NextResponse.json(
        { error: 'No password set for this account' },
        { status: 401 }
      );
    }
    
    // Verify password
    const isValid = compareSync(password, storedHash);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Create simple session (no tokens needed)
    const session = {
      userId: profileId,
      email,
      tenantId,
    };
    
    // Return success with session data
    // Cookie will be set by the client
    return NextResponse.json({
      success: true,
      userId: profileId,
      email,
      tenantId,
    });
    
  } catch (error) {
    console.error('[login-simple] Error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
