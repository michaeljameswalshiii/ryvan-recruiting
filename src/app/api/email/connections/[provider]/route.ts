/**
 * Email Connection Disconnect API
 * Disconnect an email provider
 * 
 * DELETE /api/email/connections/gmail?userId=xxx
 * DELETE /api/email/connections/outlook?userId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteEmailConnection, getEmailConnection } from '@/lib/db/repositories/email-connection-repository';
import { revokeGmailConnection, revokeOutlookConnection } from '@/lib/email/oauth-service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    if (provider !== 'gmail' && provider !== 'outlook') {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      );
    }
    
    // Get connection first
    const connection = await getEmailConnection(userId, provider);
    
    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }
    
    // Revoke the connection (notify provider, etc.)
    if (provider === 'gmail') {
      await revokeGmailConnection(userId);
    } else {
      await revokeOutlookConnection(userId);
    }
    
    // Delete the connection
    await deleteEmailConnection(userId, provider);
    
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[Email Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
