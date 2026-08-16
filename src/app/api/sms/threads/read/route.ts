/** Mark an authorized SMS conversation as read. */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { isTenantAdminOrAbove } from '@/lib/roles';
import { markSmsConversationRead } from '@/lib/db/repositories/sms-repository';

export async function POST(request: NextRequest) {
  try {
    const [session, tenantId] = await Promise.all([
      getSession(),
      getSessionTenantId(),
    ]);
    if (!session || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const conversationKey = String(body.conversationKey || '').trim();
    if (!conversationKey) {
      return NextResponse.json(
        { error: 'conversationKey is required' },
        { status: 400 }
      );
    }
    const ok = await markSmsConversationRead({
      tenantId,
      conversationKey,
      userId: session.userId,
      canReadAll: isTenantAdminOrAbove(session.role),
    });
    if (!ok) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[SMS_READ_THREAD]', error);
    return NextResponse.json(
      { error: 'Failed to mark conversation read' },
      { status: 500 }
    );
  }
}
