export async function getJobEvents(
  jobId: string,
  options?: { limit?: number }
) {
  console.log(`[getJobEvents] START for job ${jobId}`);

  try {
    const tenantId = await getEventTenantId();
    console.log(`[getJobEvents] Using tenant: ${tenantId}`);

    // CORRECT GSI Query
    const rawEvents = await queryItems(
      eventsTable,
      'GSI1PK = :gsi1pk',
      { ':gsi1pk': `TENANT#${tenantId}` },
      {
        IndexName: 'GSI1',           // IMPORTANT: Use your GSI name
        Limit: options?.limit || 50,
        ScanIndexForward: false,     // Newest first
      }
    );

    console.log(`[getJobEvents] Raw DB items from GSI: ${rawEvents.length}`);

    let filtered = rawEvents.filter((e: any) => e.entityId === jobId && e.entityType === 'job');
    console.log(`[getJobEvents] After entity filter: ${filtered.length}`);

    const sorted = filtered.sort((a: any, b: any) => (b.SK || '').localeCompare(a.SK || ''));
    const limited = sorted.slice(0, options?.limit || 50);

    const mapped = limited.map((e: any) => ({
      id: (e.SK || '').replace('EVENT#', ''),
      entityId: e.entityId,
      entityType: 'job',
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      metadata: e.metadata,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
    }));

    console.log(`[getJobEvents] FINAL returning ${mapped.length} events`);
    return { events: mapped, hasMore: sorted.length > (options?.limit || 50) };
  } catch (error) {
    console.error(`[getJobEvents] ERROR:`, error);
    return { events: [] };
  }
}
