/**
 * Scheduling hub API
 * GET /api/scheduling — overview: interviews, links, analytics summary
 *
 * @serverOnly
 */

import { NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import {
  listInterviews,
  listScheduleLinks,
  listPools,
  listPlans,
  listCalendars,
  listClientPortals,
} from '@/lib/db/repositories/scheduling-repository';
import { computeAnalytics } from '@/lib/scheduling/booking';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [interviews, links, pools, plans, calendars, portals] =
      await Promise.all([
        listInterviews(tenantId),
        listScheduleLinks(tenantId),
        listPools(tenantId),
        listPlans(tenantId),
        listCalendars(tenantId),
        listClientPortals(tenantId),
      ]);

    const analytics = computeAnalytics(interviews, links);

    return NextResponse.json({
      interviews,
      links,
      pools,
      plans,
      calendars,
      portals,
      analytics,
    });
  } catch (error) {
    console.error('[SCHEDULING] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load scheduling data' },
      { status: 500 }
    );
  }
}
