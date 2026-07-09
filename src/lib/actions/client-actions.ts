export async function getClients() {
  try {
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();

    console.log('[getClients] tenantId:', tenantId, 'userId:', userId);

    if (!tenantId) {
      if (userId) {
        const fallbackTenant = `tenant-${userId}`;
        console.log('[getClients] Using fallback:', fallbackTenant);
        const clients = await getAllClients(fallbackTenant);
        return { clients };
      }
      return { clients: [] };
    }

    const clients = await getAllClients(tenantId);
    return { clients };
  } catch (error: any) {
    console.error('[getClients] Critical error:', error);
    return { clients: [], error: error.message };
  }
}
