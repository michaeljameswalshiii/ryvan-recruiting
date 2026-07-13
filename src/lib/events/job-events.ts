// src/lib/events/job-events.ts
export async function getJobEvents(
  jobId: string,
  options?: { limit?: number; cursor?: any; eventTypes?: string[] }
) {
  console.log(`[getJobEvents] START - jobId: ${jobId}, options:`, options);

  try {
    // Your existing query logic here...
    // Example:
    const tenantId = await getEventTenantId(); // whatever you use
    console.log(`[getJobEvents] Using tenantId: ${tenantId}`);

    // ... your DynamoDB query ...

    console.log(`[getJobEvents] Raw DB results count:`, rawResults?.length || 0);
    console.log(`[getJobEvents] Raw events:`, rawResults); // Log the full results

    // Your filtering logic...
    const filtered = rawResults.filter(/* your filter */);
    console.log(`[getJobEvents] After filter: ${filtered.length} events for job ${jobId}`);

    const finalEvents = filtered.slice(0, options?.limit || 50);
    console.log(`[getJobEvents] Returning ${finalEvents.length} events`);

    return { events: finalEvents, hasMore: false, totalCount: finalEvents.length };
  } catch (error) {
    console.error(`[getJobEvents] ERROR:`, error);
    return { events: [], hasMore: false, totalCount: 0 };
  }
}

// Keep your addNoteToJob and recordJobEvent as-is (they are working)
