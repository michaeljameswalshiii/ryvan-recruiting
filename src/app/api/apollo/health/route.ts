import { checkApolloHealth } from '@/lib/apollo/client';
import { getSession, getSessionTenantId } from '@/lib/server-auth';

export async function GET() {
  const session = await getSession().catch(() => null);
  const tenantId =
    session?.tenantId || (await getSessionTenantId().catch(() => null));

  const health = await checkApolloHealth(
    tenantId ? { tenantId } : undefined
  );
  return Response.json(health);
}
