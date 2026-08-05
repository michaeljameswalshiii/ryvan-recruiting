/**
 * POST /api/admin/backfill-ai-review
 * Site admin: retag AI fit activity notes from Other → AI Review.
 *
 * Body: { dryRun?: boolean }  — default dryRun true
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  requireSiteAdminSession,
  isAdminAuthError,
} from '@/lib/admin-auth';
import { backfillAiReviewNoteTypes } from '@/lib/events/backfill-ai-review';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const body = await request.json().catch(() => ({}));
    // Explicit dryRun: false required to write
    const dryRun = body.dryRun !== false;
    const maxUpdates =
      typeof body.maxUpdates === 'number' ? body.maxUpdates : undefined;

    const result = await backfillAiReviewNoteTypes({ dryRun, maxUpdates });

    return NextResponse.json({
      success: true,
      message: dryRun
        ? 'Dry run only — pass { "dryRun": false } to apply changes'
        : 'Backfill applied',
      ...result,
    });
  } catch (error) {
    console.error('[backfill-ai-review]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Backfill failed',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const result = await backfillAiReviewNoteTypes({ dryRun: true });
    return NextResponse.json({
      success: true,
      message: 'Dry run preview (GET is always dry-run)',
      ...result,
    });
  } catch (error) {
    console.error('[backfill-ai-review GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
