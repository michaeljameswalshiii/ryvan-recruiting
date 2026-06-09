/**
 * Email Connections API
 * Get user's email connections
 * 
 * GET /api/email/connections?userId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserEmailConnections, getActiveEmailConnections } from '@/lib/db/repositories/email-connection-repository';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Get all connections
    const connections = await getUserEmailConnections(userId);
    const activeConnections = await getActiveEmailConnections(userId);
    
    // Return safe data (without tokens)
    const safeConnections = connections.map(c => ({
      provider: c.provider,
      emailAddress: c.emailAddress,
      status: c.status,
      lastSyncedAt: c.lastSyncedAt,
      createdAt: c.createdAt,
    }));
    
    return NextResponse.json({
      connections: safeConnections,
      activeConnections,
    });
  } catch (error) {
    console.error('[Email Connections] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get connections' },
      { status: 500 }
    );
  }
}
