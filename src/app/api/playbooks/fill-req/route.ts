/**
 * Fill this req playbook API
 * POST /api/playbooks/fill-req
 *   { jobId, maxCandidates?, sequenceId?, confirmed?, enrollTop? }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import {
  runFillReqPlaybook,
  executeFillReqActions,
  type FillReqAction,
} from '@/lib/ai/playbooks/fill-req';
import { z } from 'zod';

const bodySchema = z.object({
  jobId: z.string().min(1),
  maxCandidates: z.number().int().min(1).max(50).optional(),
  sequenceId: z.string().optional(),
  confirmed: z.boolean().optional(),
  enrollTop: z.number().int().min(0).max(20).optional(),
  linkTop: z.number().int().min(0).max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const userId = await getSessionUserId();
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      jobId,
      maxCandidates,
      sequenceId,
      confirmed,
      enrollTop,
      linkTop,
    } = parsed.data;

    const result = await runFillReqPlaybook({
      tenantId,
      userId: userId || undefined,
      jobId,
      options: {
        maxCandidates,
        enrollSequenceId: sequenceId,
      },
    });

    let execution: Awaited<ReturnType<typeof executeFillReqActions>> | null =
      null;

    // Optional: after confirmation, link and/or enroll top N unlinked
    if (confirmed && (enrollTop || linkTop)) {
      const actions: FillReqAction[] = [];
      const unlinked = result.ranked.filter((r) => !r.alreadyLinked);

      if (linkTop && linkTop > 0) {
        for (const r of unlinked.slice(0, linkTop)) {
          actions.push({
            type: 'link',
            candidateId: r.candidateId,
            candidateName: r.name,
            candidateEmail: r.email,
          });
        }
      }

      if (enrollTop && enrollTop > 0) {
        const seq =
          sequenceId || result.suggestedSequenceId;
        if (seq) {
          for (const r of unlinked.slice(0, enrollTop)) {
            actions.push({
              type: 'enroll',
              candidateId: r.candidateId,
              sequenceId: seq,
              candidateName: r.name,
              candidateEmail: r.email,
            });
          }
        }
      }

      if (actions.length) {
        execution = await executeFillReqActions({
          tenantId,
          jobId,
          confirmed: true,
          actions,
        });
      }
    }

    return NextResponse.json({
      ...result,
      execution,
    });
  } catch (error) {
    console.error('[PLAYBOOK_FILL_REQ] error:', error);
    const message =
      error instanceof Error ? error.message : 'Playbook failed';
    const status = message === 'Job not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
