/**
 * Interview booking: create interview, write stage, mark link used, recovery links.
 *
 * @serverOnly
 */

import {
  createInterview,
  createScheduleLink,
  getPool,
  getPlan,
  listCalendars,
  listInterviews,
  markLinkUsed,
  updateInterview,
  getScheduleLinkByToken,
} from '@/lib/db/repositories/scheduling-repository';
import type {
  AdminBookInput,
  BookInterviewInput,
  Interview,
  ScheduleLink,
  SchedulingAnalytics,
} from '@/lib/schemas/scheduling';
import { generateAvailableSlots, pickPoolMember } from './availability';
import { setCandidatePipelineStage } from '@/lib/candidates/stage-sync';
import { getLeadById } from '@/lib/db/repositories/lead-repository';

export type BookResult =
  | { ok: true; interview: Interview; publicUrl?: string }
  | { ok: false; error: string; code?: string };

function conferencePlaceholder(locationType: string): string | undefined {
  if (locationType === 'video') {
    return 'https://meet.google.com/new'; // placeholder until Meet/Teams API
  }
  return undefined;
}

async function resolveParticipants(
  tenantId: string,
  poolId: string | undefined,
  existing: Interview[]
): Promise<{ email: string; name?: string; role: 'panelist' | 'recruiter' }[]> {
  if (!poolId) return [];
  const pool = await getPool(tenantId, poolId);
  if (!pool?.members?.length) return [];

  const recent = existing
    .flatMap((iv) => iv.participants || [])
    .map((p) => p.email);

  if (pool.strategy === 'all_required') {
    return pool.members
      .filter((m) => m.active !== false)
      .map((m) => ({
        email: m.email,
        name: m.name,
        role: (m.role === 'recruiter' ? 'recruiter' : 'panelist') as
          | 'panelist'
          | 'recruiter',
      }));
  }

  const pick = pickPoolMember(pool.members, recent);
  if (!pick) return [];
  return [{ email: pick.email, name: pick.name, role: 'panelist' }];
}

export async function getSlotsForLink(token: string) {
  const link = await getScheduleLinkByToken(token);
  if (!link) return { error: 'Link not found', status: 404 as const };
  if (link.usedAt && link.singleUse) {
    return { error: 'This link has already been used', status: 410 as const };
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return { error: 'This link has expired', status: 410 as const };
  }

  const calendars = await listCalendars(link.tenant_id);
  const interviews = await listInterviews(link.tenant_id);
  const slots = generateAvailableSlots({
    link,
    calendars,
    existingInterviews: interviews,
  });

  return {
    link: {
      token: link.token,
      interviewTypeName: link.interviewTypeName,
      durationMinutes: link.durationMinutes,
      locationType: link.locationType,
      candidateName: link.candidateName,
      jobTitle: link.jobTitle,
      mode: link.mode,
      expiresAt: link.expiresAt,
      minNoticeHours: link.minNoticeHours,
    },
    slots,
  };
}

export async function bookFromToken(
  input: BookInterviewInput
): Promise<BookResult> {
  const link = await getScheduleLinkByToken(input.token);
  if (!link) return { ok: false, error: 'Link not found', code: 'NOT_FOUND' };
  if (link.usedAt && link.singleUse) {
    return { ok: false, error: 'Link already used', code: 'USED' };
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'Link expired', code: 'EXPIRED' };
  }

  const startMs = new Date(input.startAt).getTime();
  if (Number.isNaN(startMs)) {
    return { ok: false, error: 'Invalid start time', code: 'INVALID' };
  }
  const minNotice = (link.minNoticeHours ?? 4) * 60 * 60 * 1000;
  if (startMs < Date.now() + minNotice) {
    return {
      ok: false,
      error: `Please book at least ${link.minNoticeHours}h in advance`,
      code: 'MIN_NOTICE',
    };
  }

  // Validate slot is still available
  const calendars = await listCalendars(link.tenant_id);
  const existing = await listInterviews(link.tenant_id);
  const slots = generateAvailableSlots({
    link,
    calendars,
    existingInterviews: existing,
  });
  const match = slots.find(
    (s) => Math.abs(new Date(s.start).getTime() - startMs) < 60_000
  );
  if (!match && link.mode !== 'admin_book') {
    // allow slight drift: check proposed
    const proposed = link.proposedSlots?.find(
      (s) => Math.abs(new Date(s.start).getTime() - startMs) < 60_000
    );
    if (!proposed) {
      return {
        ok: false,
        error: 'That time is no longer available',
        code: 'UNAVAILABLE',
      };
    }
  }

  const endAt = new Date(
    startMs + link.durationMinutes * 60 * 1000
  ).toISOString();

  const participants = await resolveParticipants(
    link.tenant_id,
    link.poolId,
    existing
  );

  const isPanel =
    participants.length > 1 ||
    (link.poolId &&
      (await getPool(link.tenant_id, link.poolId))?.strategy === 'all_required');

  const interview = await createInterview(link.tenant_id, {
    linkId: link.id,
    linkToken: link.token,
    candidateId: link.candidateId,
    candidateName: input.candidateName || link.candidateName,
    candidateEmail: input.candidateEmail || link.candidateEmail,
    jobId: link.jobId,
    jobTitle: link.jobTitle,
    planId: link.planId,
    planStepId: link.planStepId,
    poolId: link.poolId,
    title: `${link.interviewTypeName}${link.jobTitle ? ` — ${link.jobTitle}` : ''}`,
    status: isPanel ? 'pending_panel' : 'scheduled',
    mode: link.mode,
    locationType: link.locationType,
    conferenceUrl: conferencePlaceholder(link.locationType),
    startAt: new Date(startMs).toISOString(),
    endAt,
    timezone: input.timezone || 'America/New_York',
    durationMinutes: link.durationMinutes,
    participants: [
      ...participants.map((p) => ({
        email: p.email,
        name: p.name,
        role: p.role as 'panelist' | 'recruiter',
        status: 'pending' as const,
        isHold: !!isPanel,
      })),
      ...(input.candidateEmail || link.candidateEmail
        ? [
            {
              email: (input.candidateEmail || link.candidateEmail) as string,
              name: input.candidateName || link.candidateName,
              role: 'candidate' as const,
              status: 'accepted' as const,
              isHold: false,
            },
          ]
        : []),
    ],
    stageOnBook: link.stageOnBook,
    scorecardRequired: true,
    scorecardCompleted: false,
    rescheduleCount: 0,
    notes: input.notes,
  });

  // Stage writeback
  let stageWritten: string | undefined;
  try {
    const result = await setCandidatePipelineStage(
      link.candidateId,
      link.stageOnBook || 'interviewing',
      { tenantId: link.tenant_id }
    );
    if (result.stageUpdated || result.stageToStore) {
      stageWritten = result.stageToStore || link.stageOnBook;
      await updateInterview(link.tenant_id, interview.id, {
        stageWritten,
        status: isPanel ? 'pending_panel' : 'confirmed',
      });
    }
  } catch (e) {
    console.warn('[scheduling] stage writeback failed', e);
  }

  await markLinkUsed(link);

  return {
    ok: true,
    interview: {
      ...interview,
      stageWritten,
      status: isPanel ? 'pending_panel' : 'confirmed',
    },
  };
}

export async function adminBook(
  tenantId: string,
  input: AdminBookInput,
  createdBy?: string
): Promise<BookResult> {
  const startMs = new Date(input.startAt).getTime();
  if (Number.isNaN(startMs)) {
    return { ok: false, error: 'Invalid start time' };
  }
  const duration = input.durationMinutes || 30;
  const endAt = new Date(startMs + duration * 60 * 1000).toISOString();

  let interviewTypeName = input.title;
  let stageOnBook = input.stageOnBook || 'interviewing';
  let poolId = input.poolId;
  let planStepId = input.planStepId;

  if (input.planId) {
    const plan = await getPlan(tenantId, input.planId);
    if (plan) {
      const step =
        plan.steps.find((s) => s.id === input.planStepId) || plan.steps[0];
      if (step) {
        interviewTypeName = interviewTypeName || step.name;
        stageOnBook = step.stageOnBook || stageOnBook;
        poolId = poolId || step.poolId;
        planStepId = step.id;
      }
    }
  }

  // Enrich candidate name from lead if missing
  let candidateName = input.candidateName;
  let candidateEmail = input.candidateEmail;
  if (!candidateName || !candidateEmail) {
    try {
      const lead = await getLeadById(tenantId, input.candidateId);
      if (lead) {
        candidateName =
          candidateName ||
          (lead as { name?: string; fullName?: string }).name ||
          (lead as { fullName?: string }).fullName;
        candidateEmail =
          candidateEmail || (lead as { email?: string }).email;
      }
    } catch {
      /* ignore */
    }
  }

  const existing = await listInterviews(tenantId);
  const poolParticipants = await resolveParticipants(tenantId, poolId, existing);
  const extra = (input.participantEmails || []).map((email) => ({
    email,
    role: 'panelist' as const,
    status: 'pending' as const,
    isHold: false,
  }));

  const title =
    interviewTypeName ||
    `Interview${input.jobTitle ? ` — ${input.jobTitle}` : ''}`;

  const interview = await createInterview(tenantId, {
    candidateId: input.candidateId,
    candidateName,
    candidateEmail,
    jobId: input.jobId,
    jobTitle: input.jobTitle,
    planId: input.planId,
    planStepId,
    poolId,
    title,
    status: 'scheduled',
    mode: 'admin_book',
    locationType: input.locationType || 'video',
    locationDetail: input.locationDetail,
    conferenceUrl: conferencePlaceholder(input.locationType || 'video'),
    startAt: new Date(startMs).toISOString(),
    endAt,
    timezone: input.timezone || 'America/New_York',
    durationMinutes: duration,
    participants: [
      ...poolParticipants.map((p) => ({
        email: p.email,
        name: p.name,
        role: p.role as 'panelist' | 'recruiter',
        status: 'pending' as const,
        isHold: false,
      })),
      ...extra,
      ...(candidateEmail
        ? [
            {
              email: candidateEmail,
              name: candidateName,
              role: 'candidate' as const,
              status: 'accepted' as const,
              isHold: false,
            },
          ]
        : []),
    ],
    stageOnBook,
    scorecardRequired: true,
    scorecardCompleted: false,
    rescheduleCount: 0,
    notes: input.notes,
    createdBy,
  });

  try {
    const result = await setCandidatePipelineStage(
      input.candidateId,
      stageOnBook,
      { tenantId }
    );
    if (result.stageToStore) {
      await updateInterview(tenantId, interview.id, {
        stageWritten: result.stageToStore,
        status: 'confirmed',
      });
    }
  } catch (e) {
    console.warn('[scheduling] admin stage writeback failed', e);
  }

  return { ok: true, interview };
}

/**
 * Mark no-show and create a recovery self-schedule link.
 */
export async function markNoShowAndRecover(
  tenantId: string,
  interviewId: string,
  baseUrl: string
): Promise<BookResult & { recoveryUrl?: string }> {
  const interview = await updateInterview(tenantId, interviewId, {
    status: 'no_show',
  });
  if (!interview) return { ok: false, error: 'Interview not found' };

  const recovery = await createScheduleLink(tenantId, {
    candidateId: interview.candidateId,
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    jobId: interview.jobId,
    jobTitle: interview.jobTitle,
    planId: interview.planId,
    planStepId: interview.planStepId,
    poolId: interview.poolId,
    interviewTypeName: `Reschedule: ${interview.title}`,
    durationMinutes: interview.durationMinutes,
    locationType: interview.locationType,
    stageOnBook: interview.stageOnBook || 'interviewing',
    mode: 'self_serve',
    expiresInDays: 5,
    singleUse: true,
    minNoticeHours: 2,
  });

  await updateInterview(tenantId, interviewId, {
    noShowRecovered: true,
    recoveryLinkToken: recovery.token,
  });

  // Keep candidate in interviewing / note recovery available
  try {
    await setCandidatePipelineStage(interview.candidateId, 'interviewing', {
      tenantId,
    });
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    interview: { ...interview, status: 'no_show', recoveryLinkToken: recovery.token },
    recoveryUrl: `${baseUrl}/schedule/${recovery.token}`,
  };
}

export async function createLinkWithUrl(
  tenantId: string,
  input: Parameters<typeof createScheduleLink>[1],
  baseUrl: string,
  createdBy?: string
): Promise<{ link: ScheduleLink; url: string }> {
  const link = await createScheduleLink(tenantId, input, createdBy);
  return { link, url: `${baseUrl}/schedule/${link.token}` };
}

export function computeAnalytics(interviews: Interview[], links: ScheduleLink[]): SchedulingAnalytics {
  const byStatus: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  let rescheduleSum = 0;
  let selfServe = 0;
  const loadMap = new Map<string, { email: string; name?: string; count: number }>();

  const now = Date.now();
  const week = now + 7 * 24 * 60 * 60 * 1000;
  let upcoming7d = 0;

  for (const iv of interviews) {
    byStatus[iv.status] = (byStatus[iv.status] || 0) + 1;
    byMode[iv.mode] = (byMode[iv.mode] || 0) + 1;
    rescheduleSum += iv.rescheduleCount || 0;
    if (iv.mode === 'self_serve') selfServe++;
    const start = new Date(iv.startAt).getTime();
    if (
      start >= now &&
      start <= week &&
      !['cancelled', 'no_show', 'completed'].includes(iv.status)
    ) {
      upcoming7d++;
    }
    for (const p of iv.participants || []) {
      if (p.role === 'candidate') continue;
      const cur = loadMap.get(p.email) || { email: p.email, name: p.name, count: 0 };
      cur.count += 1;
      loadMap.set(p.email, cur);
    }
  }

  const scheduled = byStatus['scheduled'] || 0;
  const confirmed = byStatus['confirmed'] || 0;
  const completed = byStatus['completed'] || 0;
  const noShows = byStatus['no_show'] || 0;
  const cancelled = byStatus['cancelled'] || 0;
  const finishedLike = completed + noShows;
  const noShowRate = finishedLike > 0 ? noShows / finishedLike : 0;
  const openLinks = links.filter(
    (l) => !l.usedAt && new Date(l.expiresAt).getTime() > now
  ).length;

  return {
    totalInterviews: interviews.length,
    scheduled: scheduled + confirmed + (byStatus['pending_panel'] || 0),
    completed,
    noShows,
    cancelled,
    noShowRate,
    selfServeRate: interviews.length ? selfServe / interviews.length : 0,
    avgRescheduleCount: interviews.length ? rescheduleSum / interviews.length : 0,
    openLinks,
    upcoming7d,
    byStatus,
    byMode,
    interviewerLoad: [...loadMap.values()].sort((a, b) => b.count - a.count).slice(0, 20),
  };
}
