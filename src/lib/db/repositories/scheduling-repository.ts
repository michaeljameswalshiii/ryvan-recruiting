/**
 * Scheduling Repository
 * Stores pools, plans, calendar connections, links, interviews, client portals
 * in the profiles table (no new infra — same pattern as sequences).
 *
 * ID prefixes:
 * - pool#${tenantId}#${id}
 * - plan#${tenantId}#${id}
 * - cal#${tenantId}#${userId}
 * - slink#${tenantId}#${id}
 * - interview#${tenantId}#${id}
 * - cportal#${tenantId}#${id}
 * - stoken#${token}  (token → link lookup)
 * - ctoken#${token}  (token → client portal lookup)
 * Indexes: sched-pools#, sched-plans#, sched-links#, sched-interviews#, sched-portals#, sched-cals#
 *
 * @serverOnly
 */

import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import type {
  InterviewerPool,
  CreatePoolInput,
  InterviewPlan,
  CreatePlanInput,
  CalendarConnection,
  UpsertCalendarInput,
  ScheduleLink,
  CreateScheduleLinkInput,
  Interview,
  ClientPortal,
  CreateClientPortalInput,
  InterviewPlanStep,
  WorkingHoursDay,
} from '../../schemas/scheduling';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) {
    t += chars[Math.floor(Math.random() * chars.length)];
  }
  return t;
}

function poolKey(tenantId: string, id: string) {
  return `pool#${tenantId}#${id}`;
}
function planKey(tenantId: string, id: string) {
  return `plan#${tenantId}#${id}`;
}
function calKey(tenantId: string, userId: string) {
  return `cal#${tenantId}#${userId}`;
}
function linkKey(tenantId: string, id: string) {
  return `slink#${tenantId}#${id}`;
}
function interviewKey(tenantId: string, id: string) {
  return `interview#${tenantId}#${id}`;
}
function portalKey(tenantId: string, id: string) {
  return `cportal#${tenantId}#${id}`;
}
function tokenLookupKey(token: string) {
  return `stoken#${token}`;
}
function clientTokenLookupKey(token: string) {
  return `ctoken#${token}`;
}

function idxPools(tenantId: string) {
  return `sched-pools#${tenantId}`;
}
function idxPlans(tenantId: string) {
  return `sched-plans#${tenantId}`;
}
function idxLinks(tenantId: string) {
  return `sched-links#${tenantId}`;
}
function idxInterviews(tenantId: string) {
  return `sched-interviews#${tenantId}`;
}
function idxPortals(tenantId: string) {
  return `sched-portals#${tenantId}`;
}
function idxCals(tenantId: string) {
  return `sched-cals#${tenantId}`;
}

interface IdIndex {
  id: string;
  tenant_id: string;
  type: string;
  ids: string[];
  updatedAt: string;
}

async function getIndex(indexKey: string): Promise<IdIndex | null> {
  try {
    return await getItem<IdIndex>(tableNames.profiles, { id: indexKey });
  } catch {
    return null;
  }
}

async function addToIndex(
  indexKey: string,
  tenantId: string,
  type: string,
  itemId: string
): Promise<void> {
  const existing = await getIndex(indexKey);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(itemId)) ids.push(itemId);
  await putItem(tableNames.profiles, {
    id: indexKey,
    tenant_id: tenantId,
    type,
    ids,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

async function removeFromIndex(indexKey: string, itemId: string): Promise<void> {
  const existing = await getIndex(indexKey);
  if (!existing?.ids?.length) return;
  await putItem(tableNames.profiles, {
    ...existing,
    ids: existing.ids.filter((x) => x !== itemId),
    updatedAt: new Date().toISOString(),
  });
}

async function listByIndex<T extends { id: string }>(
  indexKey: string,
  loadOne: (id: string) => Promise<T | null>
): Promise<T[]> {
  const idx = await getIndex(indexKey);
  if (!idx?.ids?.length) return [];
  const items: T[] = [];
  for (const id of idx.ids) {
    const item = await loadOne(id);
    if (item) items.push(item);
  }
  return items;
}

export function defaultWorkingHours(): WorkingHoursDay[] {
  return [
    { day: 0, enabled: false, start: '09:00', end: '17:00' },
    { day: 1, enabled: true, start: '09:00', end: '17:00' },
    { day: 2, enabled: true, start: '09:00', end: '17:00' },
    { day: 3, enabled: true, start: '09:00', end: '17:00' },
    { day: 4, enabled: true, start: '09:00', end: '17:00' },
    { day: 5, enabled: true, start: '09:00', end: '17:00' },
    { day: 6, enabled: false, start: '09:00', end: '17:00' },
  ];
}

export function defaultPlanSteps(): InterviewPlanStep[] {
  return [
    {
      id: generateId(),
      order: 0,
      name: 'Recruiter screen',
      durationMinutes: 30,
      locationType: 'video',
      stageOnBook: 'interviewing',
      scorecardRequired: true,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      prepNotes: 'Confirm interest, compensation, timeline, and role fit.',
    },
    {
      id: generateId(),
      order: 1,
      name: 'Hiring manager interview',
      durationMinutes: 45,
      locationType: 'video',
      stageOnBook: 'interviewing',
      scorecardRequired: true,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 15,
      prepNotes: 'Deep-dive on experience and team fit.',
    },
    {
      id: generateId(),
      order: 2,
      name: 'Panel / final',
      durationMinutes: 60,
      locationType: 'video',
      stageOnBook: 'interviewing',
      stageOnComplete: 'offer',
      scorecardRequired: true,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 15,
      prepNotes: 'Panel: require scorecards from all participants.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export async function createPool(
  tenantId: string,
  input: CreatePoolInput,
  createdBy?: string
): Promise<InterviewerPool> {
  const shortId = generateId();
  const now = new Date().toISOString();
  const id = poolKey(tenantId, shortId);
  const pool: InterviewerPool = {
    id,
    tenant_id: tenantId,
    type: 'interviewer_pool',
    name: input.name,
    description: input.description,
    members: input.members || [],
    strategy: input.strategy || 'round_robin',
    minRequired: input.minRequired,
    clientId: input.clientId,
    jobId: input.jobId,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
  await putItem(tableNames.profiles, pool);
  await addToIndex(idxPools(tenantId), tenantId, 'sched_pool_index', id);
  return pool;
}

export async function getPool(
  tenantId: string,
  poolId: string
): Promise<InterviewerPool | null> {
  const id = poolId.includes('#') ? poolId : poolKey(tenantId, poolId);
  try {
    const item = await getItem<InterviewerPool>(tableNames.profiles, { id });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function listPools(tenantId: string): Promise<InterviewerPool[]> {
  return listByIndex(idxPools(tenantId), async (id) => {
    try {
      const item = await getItem<InterviewerPool>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
}

export async function updatePool(
  tenantId: string,
  poolId: string,
  patch: Partial<CreatePoolInput>
): Promise<InterviewerPool | null> {
  const existing = await getPool(tenantId, poolId);
  if (!existing) return null;
  const updated: InterviewerPool = {
    ...existing,
    ...patch,
    id: existing.id,
    tenant_id: tenantId,
    type: 'interviewer_pool',
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, updated);
  return updated;
}

export async function deletePool(tenantId: string, poolId: string): Promise<boolean> {
  const existing = await getPool(tenantId, poolId);
  if (!existing) return false;
  await deleteItem(tableNames.profiles, { id: existing.id });
  await removeFromIndex(idxPools(tenantId), existing.id);
  return true;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function createPlan(
  tenantId: string,
  input: CreatePlanInput,
  createdBy?: string
): Promise<InterviewPlan> {
  const shortId = generateId();
  const now = new Date().toISOString();
  const id = planKey(tenantId, shortId);
  const plan: InterviewPlan = {
    id,
    tenant_id: tenantId,
    type: 'interview_plan',
    name: input.name,
    description: input.description,
    jobId: input.jobId,
    jobTitle: input.jobTitle,
    steps: input.steps?.length ? input.steps : defaultPlanSteps(),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
  await putItem(tableNames.profiles, plan);
  await addToIndex(idxPlans(tenantId), tenantId, 'sched_plan_index', id);
  return plan;
}

export async function getPlan(
  tenantId: string,
  planId: string
): Promise<InterviewPlan | null> {
  const id = planId.includes('#') ? planId : planKey(tenantId, planId);
  try {
    const item = await getItem<InterviewPlan>(tableNames.profiles, { id });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function listPlans(tenantId: string): Promise<InterviewPlan[]> {
  return listByIndex(idxPlans(tenantId), async (id) => {
    try {
      const item = await getItem<InterviewPlan>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
}

export async function updatePlan(
  tenantId: string,
  planId: string,
  patch: Partial<CreatePlanInput>
): Promise<InterviewPlan | null> {
  const existing = await getPlan(tenantId, planId);
  if (!existing) return null;
  const updated: InterviewPlan = {
    ...existing,
    ...patch,
    id: existing.id,
    tenant_id: tenantId,
    type: 'interview_plan',
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, updated);
  return updated;
}

export async function deletePlan(tenantId: string, planId: string): Promise<boolean> {
  const existing = await getPlan(tenantId, planId);
  if (!existing) return false;
  await deleteItem(tableNames.profiles, { id: existing.id });
  await removeFromIndex(idxPlans(tenantId), existing.id);
  return true;
}

// ---------------------------------------------------------------------------
// Calendar connections
// ---------------------------------------------------------------------------

export async function upsertCalendar(
  tenantId: string,
  userId: string,
  input: UpsertCalendarInput
): Promise<CalendarConnection> {
  const id = calKey(tenantId, userId);
  let existing: CalendarConnection | null = null;
  try {
    existing = await getItem<CalendarConnection>(tableNames.profiles, { id });
  } catch {
    existing = null;
  }
  const now = new Date().toISOString();
  const conn: CalendarConnection = {
    id,
    tenant_id: tenantId,
    type: 'calendar_connection',
    userId,
    email: input.email || existing?.email || '',
    name: input.name ?? existing?.name,
    provider: input.provider || existing?.provider || 'manual',
    connected: input.connected ?? existing?.connected ?? false,
    timezone: input.timezone || existing?.timezone || 'America/New_York',
    workingHours:
      input.workingHours || existing?.workingHours || defaultWorkingHours(),
    bufferMinutes: input.bufferMinutes ?? existing?.bufferMinutes ?? 10,
    maxInterviewsPerDay:
      input.maxInterviewsPerDay ?? existing?.maxInterviewsPerDay ?? 6,
    busyBlocks: input.busyBlocks ?? existing?.busyBlocks ?? [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, conn);
  await addToIndex(idxCals(tenantId), tenantId, 'sched_cal_index', id);
  return conn;
}

export async function getCalendar(
  tenantId: string,
  userId: string
): Promise<CalendarConnection | null> {
  try {
    const item = await getItem<CalendarConnection>(tableNames.profiles, {
      id: calKey(tenantId, userId),
    });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function listCalendars(
  tenantId: string
): Promise<CalendarConnection[]> {
  return listByIndex(idxCals(tenantId), async (id) => {
    try {
      const item = await getItem<CalendarConnection>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Schedule links
// ---------------------------------------------------------------------------

export async function createScheduleLink(
  tenantId: string,
  input: CreateScheduleLinkInput,
  createdBy?: string
): Promise<ScheduleLink> {
  const shortId = generateId();
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + (input.expiresInDays || 7));
  const id = linkKey(tenantId, shortId);

  const link: ScheduleLink = {
    id,
    tenant_id: tenantId,
    type: 'schedule_link',
    token,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail || undefined,
    jobId: input.jobId,
    jobTitle: input.jobTitle,
    planId: input.planId,
    planStepId: input.planStepId,
    poolId: input.poolId,
    interviewTypeName: input.interviewTypeName || 'Interview',
    durationMinutes: input.durationMinutes || 30,
    locationType: input.locationType || 'video',
    stageOnBook: input.stageOnBook || 'interviewing',
    mode: input.mode || 'self_serve',
    proposedSlots: input.proposedSlots,
    expiresAt: expires.toISOString(),
    singleUse: input.singleUse !== false,
    maxReschedules: input.maxReschedules ?? 3,
    minNoticeHours: input.minNoticeHours ?? 4,
    enrollmentId: input.enrollmentId,
    sequenceId: input.sequenceId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy,
  };

  await putItem(tableNames.profiles, link);
  await putItem(tableNames.profiles, {
    id: tokenLookupKey(token),
    tenant_id: tenantId,
    type: 'schedule_token_lookup',
    linkId: id,
    token,
    createdAt: now.toISOString(),
  });
  await addToIndex(idxLinks(tenantId), tenantId, 'sched_link_index', id);
  return link;
}

export async function getScheduleLinkByToken(
  token: string
): Promise<ScheduleLink | null> {
  try {
    const lookup = await getItem<{ linkId: string; tenant_id: string }>(
      tableNames.profiles,
      { id: tokenLookupKey(token) }
    );
    if (!lookup?.linkId) return null;
    const link = await getItem<ScheduleLink>(tableNames.profiles, {
      id: lookup.linkId,
    });
    return link || null;
  } catch {
    return null;
  }
}

export async function getScheduleLink(
  tenantId: string,
  linkId: string
): Promise<ScheduleLink | null> {
  const id = linkId.includes('#') ? linkId : linkKey(tenantId, linkId);
  try {
    const item = await getItem<ScheduleLink>(tableNames.profiles, { id });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function listScheduleLinks(
  tenantId: string
): Promise<ScheduleLink[]> {
  return listByIndex(idxLinks(tenantId), async (id) => {
    try {
      const item = await getItem<ScheduleLink>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
}

export async function markLinkUsed(link: ScheduleLink): Promise<void> {
  await putItem(tableNames.profiles, {
    ...link,
    usedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export async function createInterview(
  tenantId: string,
  interview: Omit<Interview, 'id' | 'tenant_id' | 'type' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<Interview> {
  const shortId = interview.id || generateId();
  const now = new Date().toISOString();
  const id = interviewKey(tenantId, shortId);
  const record: Interview = {
    ...interview,
    id,
    tenant_id: tenantId,
    type: 'interview',
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, record);
  await addToIndex(idxInterviews(tenantId), tenantId, 'sched_interview_index', id);
  return record;
}

export async function getInterview(
  tenantId: string,
  interviewId: string
): Promise<Interview | null> {
  const id = interviewId.includes('#')
    ? interviewId
    : interviewKey(tenantId, interviewId);
  try {
    const item = await getItem<Interview>(tableNames.profiles, { id });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function listInterviews(tenantId: string): Promise<Interview[]> {
  const items = await listByIndex(idxInterviews(tenantId), async (id) => {
    try {
      const item = await getItem<Interview>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
  return items.sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
  );
}

export async function updateInterview(
  tenantId: string,
  interviewId: string,
  patch: Partial<Interview>
): Promise<Interview | null> {
  const existing = await getInterview(tenantId, interviewId);
  if (!existing) return null;
  const updated: Interview = {
    ...existing,
    ...patch,
    id: existing.id,
    tenant_id: tenantId,
    type: 'interview',
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Client portals
// ---------------------------------------------------------------------------

export async function createClientPortal(
  tenantId: string,
  input: CreateClientPortalInput,
  createdBy?: string
): Promise<ClientPortal> {
  const shortId = generateId();
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + (input.expiresInDays || 30));
  const id = portalKey(tenantId, shortId);

  const portal: ClientPortal = {
    id,
    tenant_id: tenantId,
    type: 'client_portal',
    token,
    clientId: input.clientId,
    clientName: input.clientName,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    jobIds: input.jobIds || [],
    poolId: input.poolId,
    timezone: input.timezone || 'America/New_York',
    availability: [],
    active: true,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy,
  };

  await putItem(tableNames.profiles, portal);
  await putItem(tableNames.profiles, {
    id: clientTokenLookupKey(token),
    tenant_id: tenantId,
    type: 'client_portal_token_lookup',
    portalId: id,
    token,
    createdAt: now.toISOString(),
  });
  await addToIndex(idxPortals(tenantId), tenantId, 'sched_portal_index', id);
  return portal;
}

export async function getClientPortalByToken(
  token: string
): Promise<ClientPortal | null> {
  try {
    const lookup = await getItem<{ portalId: string }>(tableNames.profiles, {
      id: clientTokenLookupKey(token),
    });
    if (!lookup?.portalId) return null;
    return (
      (await getItem<ClientPortal>(tableNames.profiles, {
        id: lookup.portalId,
      })) || null
    );
  } catch {
    return null;
  }
}

export async function listClientPortals(
  tenantId: string
): Promise<ClientPortal[]> {
  return listByIndex(idxPortals(tenantId), async (id) => {
    try {
      const item = await getItem<ClientPortal>(tableNames.profiles, { id });
      if (!item || item.tenant_id !== tenantId) return null;
      return item;
    } catch {
      return null;
    }
  });
}

export async function updateClientPortal(
  portal: ClientPortal
): Promise<ClientPortal> {
  const updated = { ...portal, updatedAt: new Date().toISOString() };
  await putItem(tableNames.profiles, updated);
  return updated;
}

export { generateId, generateToken };
