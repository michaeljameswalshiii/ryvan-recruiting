/**
 * Auth Logout API Route
 * Clears session cookie and signs out from Cognito
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, signOutFromCognito, clearSessionCookie } from '@/lib/server-auth';
import {
  writeSecurityAudit,
  requestAuditMeta,
} from '@/lib/security/audit';

/**
 * POST /api/auth/logout
 * Clear session cookie and sign out
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const meta = requestAuditMeta(request);

    if (session?.accessToken) {
      try {
        await signOutFromCognito(session.accessToken);
      } catch (err) {
        console.log('Cognito sign out error:', err);
      }
    }

    if (session?.tenantId || session?.userId) {
      void writeSecurityAudit({
        tenantId: session.tenantId || 'unknown',
        action: 'auth.logout',
        actorUserId: session.userId,
        actorEmail: session.email,
        actorRole: session.role,
        summary: 'Logout',
        ...meta,
      });
    }

    return clearSessionCookie(NextResponse.json({ success: true }));
  } catch (error: unknown) {
    console.error('Logout error:', error);
    return clearSessionCookie(NextResponse.json({ success: true }));
  }
}
