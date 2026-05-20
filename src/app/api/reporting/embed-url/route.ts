/**
 * Reporting Embed URL API
 * 
 * Generates secure embed URLs for QuickSight dashboards.
 * Supports tenant-level filtering for row-level security.
 * 
 * @serverOnly - Server-side only route
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDashboardEmbedUrl, isQuickSightConfigured } from '@/lib/aws/reporting';
import { getSessionTenantId } from '@/lib/server-auth';

/**
 * POST /api/reporting/embed-url
 * 
 * Generate a secure embed URL for a QuickSight dashboard.
 * 
 * Request body:
 * {
 *   dashboardId: string,  // Required - QuickSight dashboard ID
 *   tenantId?: string    // Optional - defaults to session tenant
 * }
 * 
 * Response:
 * {
 *   embedUrl: string,
 *   expiration: string,
 *   dashboardId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if QuickSight is configured
    if (!isQuickSightConfigured()) {
      return NextResponse.json(
        { error: 'QuickSight not configured' },
        { status: 503 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { dashboardId, tenantId: providedTenantId } = body;

    // Validate dashboard ID
    if (!dashboardId) {
      return NextResponse.json(
        { error: 'dashboardId is required' },
        { status: 400 }
      );
    }

    // Get tenant ID from session if not provided
    let tenantId = providedTenantId;
    if (!tenantId) {
      tenantId = await getSessionTenantId();
    }

    // Generate embed URL
    const result = await generateDashboardEmbedUrl({
      dashboardId,
      tenantId,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to generate embed URL' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Reporting embed URL error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reporting/embed-url
 * 
 * Health check - returns whether QuickSight is configured.
 */
export async function GET() {
  const configured = isQuickSightConfigured();
  
  return NextResponse.json({
    configured,
    message: configured ? 'QuickSight is configured' : 'QuickSight not configured',
  });
}
