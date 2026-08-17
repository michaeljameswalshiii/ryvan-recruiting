/** Manager-only SMS conversation reassignment. */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { isTenantAdminOrAbove } from '@/lib/roles';
import { getProfileById } from '@/lib/db/repositories/profile-repository';
import { assignSmsConversationRoute } from '@/lib/db/repositories/sms-repository';

export async function POST(request: NextRequest) {
  try {
    const [session, tenantId] = await Promise.all([
      getSession(),
      getSessionTenantId(),
    ]);
    if (!session || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isTenantAdminOrAbove(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const conversationKey = String(body.conversationKey || '').trim();
    const ownerUserId = String(body.ownerUserId || '').trim();
    if (!conversationKey) {
      return NextResponse.json(
        { error: 'conversationKey is required' },
        { status: 400 }
      );
    }

    let ownerName: string | undefined;
    let ownerEmail: string | undefined;
    if (ownerUserId) {
      const profile = await getProfileById(ownerUserId);
      if (
        !profile ||
        profile.tenant_id !== tenantId ||
        (profile.status && profile.status !== 'active')
      ) {
        return NextResponse.json(
          { error: 'The selected user is not an active company member' },
          { status: 400 }
        );
      }
      ownerName = profile.full_name;
      ownerEmail = profile.email;
    }

    const route = await assignSmsConversationRoute({
      tenantId,
      conversationKey,
      ownerUserId: ownerUserId || undefined,
      ownerName,
      ownerEmail,
    });
    if (!route) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return NextResponse.json({ route });
  } catch (error) {
    console.error('[SMS_ASSIGN_THREAD]', error);
    return NextResponse.json(
      { error: 'Failed to assign conversation' },
      { status: 500 }
    );
  }
}
