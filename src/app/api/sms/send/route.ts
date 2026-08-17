/**
 * POST /api/sms/send — send SMS to a candidate or contact (compliance-checked)
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { sendSmsInputSchema } from '@/lib/schemas/sms';
import { sendSms } from '@/lib/sms/service';
import { listObjectAssignments } from '@/lib/db/repositories/object-assignment-repository';
import { isTenantAdminOrAbove } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    const [session, tenantId] = await Promise.all([
      getSession(),
      getSessionTenantId(),
    ]);
    if (!session || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const parsed = sendSmsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    if (!isTenantAdminOrAbove(session.role)) {
      const objectType = parsed.data.contactId ? 'contact' : 'candidate';
      const objectId = parsed.data.contactId || parsed.data.candidateId!;
      let assignments = await listObjectAssignments(
        tenantId,
        objectType,
        objectId
      );
      if (
        assignments.length === 0 &&
        objectType === 'contact' &&
        parsed.data.companyId
      ) {
        assignments = await listObjectAssignments(
          tenantId,
          'company',
          parsed.data.companyId
        );
      }
      if (
        assignments.length > 0 &&
        [...assignments].sort((a, b) => {
          const priority = ['owner', 'recruiter', 'account_manager', 'collaborator'];
          return priority.indexOf(a.role) - priority.indexOf(b.role);
        })[0]?.userId !== session.userId
      ) {
        return NextResponse.json(
          { error: 'This conversation is assigned to another team member' },
          { status: 403 }
        );
      }
    }
    const result = await sendSms(
      tenantId,
      parsed.data,
      session.userId
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }
    return NextResponse.json({
      message: result.message,
      simulated: result.simulated,
    });
  } catch (error) {
    console.error('[SMS_SEND]', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
