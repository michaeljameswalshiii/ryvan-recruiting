import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { hasPermission } from '@/lib/roles';
import { revokeMcpOAuthClient } from '@/lib/mcp/oauth';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const tenantId = await getSessionTenantId();
  if (!session?.userId || !tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session.role, 'team_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const revoked = await revokeMcpOAuthClient(tenantId, id);
  if (!revoked) {
    return NextResponse.json({ error: 'OAuth client not found or already revoked' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
