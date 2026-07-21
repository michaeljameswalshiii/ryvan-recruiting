/**
 * Sequence Repository
 * Stores sequence definitions + enrollments in the profiles table (no new infra).
 *
 * IDs:
 * - Definition:  seq-def#${tenantId}#${sequenceId}
 * - Enrollment:  seq-enroll#${tenantId}#${enrollmentId}
 * - Index items: seq-index#${tenantId}, seq-enroll-index#${tenantId}
 *
 * @serverOnly
 */

import { getItem, putItem, deleteItem, scanItems, tableNames } from '../dynamodb';
import type {
  SequenceDefinition,
  SequenceEnrollment,
  SequenceStep,
  CreateSequenceInput,
  UpdateSequenceInput,
  SequenceEnrollmentStatus,
  SequenceDraft,
} from '../../schemas/sequence';

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

function sequenceDefId(tenantId: string, sequenceId: string): string {
  return `seq-def#${tenantId}#${sequenceId}`;
}

function enrollmentId(tenantId: string, enrollId: string): string {
  return `seq-enroll#${tenantId}#${enrollId}`;
}

function defIndexId(tenantId: string): string {
  return `seq-index#${tenantId}`;
}

function enrollIndexId(tenantId: string): string {
  return `seq-enroll-index#${tenantId}`;
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

async function addToIndex(indexKey: string, tenantId: string, type: string, itemId: string): Promise<void> {
  const existing = await getIndex(indexKey);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(itemId)) {
    ids.push(itemId);
  }
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
  const ids = existing.ids.filter((x) => x !== itemId);
  await putItem(tableNames.profiles, {
    ...existing,
    ids,
    updatedAt: new Date().toISOString(),
  });
}

function defaultSteps(): SequenceStep[] {
  return [
    {
      id: generateId(),
      order: 0,
      channel: 'email',
      delayDays: 0,
      subject: 'Quick intro — {{jobTitle}} at {{companyName}}',
      bodyTemplate:
        'Hi {{candidateName}},\n\nI came across your background{{skillsPhrase}} and thought you might be a strong fit for our {{jobTitle}} role at {{companyName}}.\n\nWould you be open to a brief conversation this week?\n\nBest,\n{{recruiterName}}',
    },
    {
      id: generateId(),
      order: 1,
      channel: 'task',
      delayDays: 3,
      taskTitle: 'Follow up call / LinkedIn touch — {{candidateName}}',
    },
    {
      id: generateId(),
      order: 2,
      channel: 'email',
      delayDays: 7,
      subject: 'Following up — {{jobTitle}}',
      bodyTemplate:
        'Hi {{candidateName}},\n\nJust circling back on the {{jobTitle}} opportunity at {{companyName}}. Happy to share more detail if helpful.\n\nBest,\n{{recruiterName}}',
    },
  ];
}

// ---------------------------------------------------------------------------
// Sequence definitions
// ---------------------------------------------------------------------------

export async function createSequence(
  tenantId: string,
  input: CreateSequenceInput,
  createdBy?: string
): Promise<SequenceDefinition> {
  const shortId = generateId();
  const now = new Date().toISOString();
  const id = sequenceDefId(tenantId, shortId);

  const def: SequenceDefinition = {
    id,
    tenant_id: tenantId,
    type: 'sequence_definition',
    name: input.name,
    description: input.description,
    steps: input.steps?.length ? input.steps : defaultSteps(),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await putItem(tableNames.profiles, def);
  await addToIndex(defIndexId(tenantId), tenantId, 'sequence_def_index', id);
  return def;
}

export async function listSequences(tenantId: string): Promise<SequenceDefinition[]> {
  const index = await getIndex(defIndexId(tenantId));
  if (index?.ids?.length) {
    const results: SequenceDefinition[] = [];
    for (const id of index.ids) {
      const item = await getItem<SequenceDefinition>(tableNames.profiles, { id });
      if (item && item.type === 'sequence_definition' && item.tenant_id === tenantId) {
        results.push(item);
      }
    }
    return results.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Fallback: scan profiles for this tenant's sequence definitions
  try {
    const scanned = await scanItems<SequenceDefinition>(
      tableNames.profiles,
      '#type = :type AND tenant_id = :tid',
      { ':type': 'sequence_definition', ':tid': tenantId },
      { '#type': 'type' }
    );
    // Rebuild index for next time
    if (scanned.length) {
      await putItem(tableNames.profiles, {
        id: defIndexId(tenantId),
        tenant_id: tenantId,
        type: 'sequence_def_index',
        ids: scanned.map((s) => s.id),
        updatedAt: new Date().toISOString(),
      } satisfies IdIndex);
    }
    return scanned.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (err) {
    console.error('[sequence-repository] listSequences scan failed:', err);
    return [];
  }
}

export async function getSequence(
  tenantId: string,
  sequenceIdOrFullId: string
): Promise<SequenceDefinition | null> {
  const candidates = [
    sequenceIdOrFullId,
    sequenceDefId(tenantId, sequenceIdOrFullId),
  ];
  // If already full id starting with seq-def#
  if (sequenceIdOrFullId.startsWith('seq-def#')) {
    candidates.length = 0;
    candidates.push(sequenceIdOrFullId);
  }

  for (const id of candidates) {
    const item = await getItem<SequenceDefinition>(tableNames.profiles, { id });
    if (item && item.type === 'sequence_definition' && item.tenant_id === tenantId) {
      return item;
    }
  }
  return null;
}

export async function updateSequence(
  tenantId: string,
  sequenceIdOrFullId: string,
  input: UpdateSequenceInput
): Promise<SequenceDefinition | null> {
  const existing = await getSequence(tenantId, sequenceIdOrFullId);
  if (!existing) return null;

  const updated: SequenceDefinition = {
    ...existing,
    name: input.name ?? existing.name,
    description:
      input.description === null
        ? undefined
        : input.description !== undefined
          ? input.description
          : existing.description,
    steps: input.steps ?? existing.steps,
    active: input.active !== undefined ? input.active : existing.active,
    updatedAt: new Date().toISOString(),
  };

  await putItem(tableNames.profiles, updated);
  return updated;
}

export async function deleteSequence(
  tenantId: string,
  sequenceIdOrFullId: string
): Promise<boolean> {
  const existing = await getSequence(tenantId, sequenceIdOrFullId);
  if (!existing) return false;
  await deleteItem(tableNames.profiles, { id: existing.id });
  await removeFromIndex(defIndexId(tenantId), existing.id);
  return true;
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export async function enrollCandidate(
  tenantId: string,
  params: {
    sequenceId: string;
    candidateId: string;
    candidateName?: string;
    candidateEmail?: string;
    jobId?: string;
    jobTitle?: string;
    drafts?: SequenceDraft[];
    /** User who enrolled — used for OAuth email send on run/cron */
    enrolledByUserId?: string;
  }
): Promise<SequenceEnrollment> {
  const sequence = await getSequence(tenantId, params.sequenceId);
  if (!sequence) {
    throw new Error('Sequence not found');
  }
  if (!sequence.active) {
    throw new Error('Sequence is not active');
  }

  const shortId = generateId();
  const now = new Date().toISOString();
  const id = enrollmentId(tenantId, shortId);

  const firstDelay = sequence.steps[0]?.delayDays ?? 0;
  const nextRunAt = new Date(Date.now() + firstDelay * 24 * 60 * 60 * 1000).toISOString();

  const enrollment: SequenceEnrollment & { enrolledByUserId?: string } = {
    id,
    tenant_id: tenantId,
    type: 'sequence_enrollment',
    sequenceId: sequence.id,
    candidateId: params.candidateId,
    candidateName: params.candidateName,
    candidateEmail: params.candidateEmail,
    jobId: params.jobId,
    jobTitle: params.jobTitle,
    status: 'active',
    currentStepIndex: 0,
    nextRunAt,
    drafts: params.drafts,
    createdAt: now,
    updatedAt: now,
    ...(params.enrolledByUserId
      ? { enrolledByUserId: params.enrolledByUserId }
      : {}),
  };

  await putItem(tableNames.profiles, enrollment);
  await addToIndex(enrollIndexId(tenantId), tenantId, 'sequence_enroll_index', id);
  return enrollment;
}

/**
 * Pick default active sequence, or create the standard 3-step if none exist.
 */
export async function getOrCreateDefaultSequence(
  tenantId: string,
  createdBy?: string
): Promise<SequenceDefinition> {
  const existing = await listSequences(tenantId);
  const active = existing.find((s) => s.active);
  if (active) return active;
  if (existing[0]) return existing[0];

  return createSequence(tenantId, {
    name: 'Default 3-step outreach',
    description: 'Day 0 email · Day 3 task · Day 7 follow-up',
    active: true,
  }, createdBy);
}

export async function listEnrollments(tenantId: string): Promise<SequenceEnrollment[]> {
  const index = await getIndex(enrollIndexId(tenantId));
  if (index?.ids?.length) {
    const results: SequenceEnrollment[] = [];
    for (const id of index.ids) {
      const item = await getItem<SequenceEnrollment>(tableNames.profiles, { id });
      if (item && item.type === 'sequence_enrollment' && item.tenant_id === tenantId) {
        results.push(item);
      }
    }
    return results.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  try {
    const scanned = await scanItems<SequenceEnrollment>(
      tableNames.profiles,
      '#type = :type AND tenant_id = :tid',
      { ':type': 'sequence_enrollment', ':tid': tenantId },
      { '#type': 'type' }
    );
    if (scanned.length) {
      await putItem(tableNames.profiles, {
        id: enrollIndexId(tenantId),
        tenant_id: tenantId,
        type: 'sequence_enroll_index',
        ids: scanned.map((s) => s.id),
        updatedAt: new Date().toISOString(),
      } satisfies IdIndex);
    }
    return scanned.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (err) {
    console.error('[sequence-repository] listEnrollments scan failed:', err);
    return [];
  }
}

export async function getEnrollment(
  tenantId: string,
  enrollmentIdOrFull: string
): Promise<SequenceEnrollment | null> {
  const candidates = enrollmentIdOrFull.startsWith('seq-enroll#')
    ? [enrollmentIdOrFull]
    : [enrollmentIdOrFull, enrollmentId(tenantId, enrollmentIdOrFull)];

  for (const id of candidates) {
    const item = await getItem<SequenceEnrollment>(tableNames.profiles, { id });
    if (item && item.type === 'sequence_enrollment' && item.tenant_id === tenantId) {
      return item;
    }
  }
  return null;
}

export async function advanceEnrollment(
  tenantId: string,
  enrollmentIdOrFull: string
): Promise<SequenceEnrollment | null> {
  const enrollment = await getEnrollment(tenantId, enrollmentIdOrFull);
  if (!enrollment) return null;
  if (enrollment.status !== 'active') return enrollment;

  const sequence = await getSequence(tenantId, enrollment.sequenceId);
  if (!sequence) return enrollment;

  const nextIndex = enrollment.currentStepIndex + 1;
  const now = new Date().toISOString();

  if (nextIndex >= sequence.steps.length) {
    const completed: SequenceEnrollment = {
      ...enrollment,
      status: 'completed',
      lastSentAt: now,
      updatedAt: now,
    };
    await putItem(tableNames.profiles, completed);
    return completed;
  }

  const delayDays = sequence.steps[nextIndex]?.delayDays ?? 0;
  const nextRunAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

  const advanced: SequenceEnrollment = {
    ...enrollment,
    currentStepIndex: nextIndex,
    lastSentAt: now,
    nextRunAt,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, advanced);
  return advanced;
}

export async function pauseEnrollment(
  tenantId: string,
  enrollmentIdOrFull: string
): Promise<SequenceEnrollment | null> {
  return setEnrollmentStatus(tenantId, enrollmentIdOrFull, 'paused');
}

export async function stopEnrollment(
  tenantId: string,
  enrollmentIdOrFull: string
): Promise<SequenceEnrollment | null> {
  return setEnrollmentStatus(tenantId, enrollmentIdOrFull, 'stopped');
}

export async function resumeEnrollment(
  tenantId: string,
  enrollmentIdOrFull: string
): Promise<SequenceEnrollment | null> {
  return setEnrollmentStatus(tenantId, enrollmentIdOrFull, 'active');
}

async function setEnrollmentStatus(
  tenantId: string,
  enrollmentIdOrFull: string,
  status: SequenceEnrollmentStatus
): Promise<SequenceEnrollment | null> {
  const enrollment = await getEnrollment(tenantId, enrollmentIdOrFull);
  if (!enrollment) return null;
  const updated: SequenceEnrollment = {
    ...enrollment,
    status,
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, updated);
  return updated;
}

/**
 * Enrollments that are due to run (nextRunAt <= now && status active).
 */
export async function listDueEnrollments(tenantId: string): Promise<SequenceEnrollment[]> {
  const all = await listEnrollments(tenantId);
  const now = Date.now();
  return all.filter((e) => {
    if (e.status !== 'active') return false;
    const t = Date.parse(e.nextRunAt);
    return !Number.isNaN(t) && t <= now;
  });
}

export type EnrollmentHistoryEntry = {
  at: string;
  stepIndex: number;
  channel: string;
  action: string;
  subject?: string;
  messageId?: string;
};

/**
 * Patch enrollment fields + optional history append (flexible extras beyond zod schema).
 */
export async function putEnrollmentPatch(
  tenantId: string,
  enrollmentIdOrFull: string,
  patch: {
    lastSentAt?: string;
    lastMessageId?: string;
    lastChannel?: string;
    nextRunAt?: string;
    status?: SequenceEnrollmentStatus;
    historyEntry?: EnrollmentHistoryEntry;
    processedMessageIds?: string[];
    lastReplySnippet?: string;
    lastReplyAt?: string;
    lastReplyClassification?: string;
  }
): Promise<SequenceEnrollment | null> {
  const enrollment = await getEnrollment(tenantId, enrollmentIdOrFull);
  if (!enrollment) return null;

  const prev = enrollment as SequenceEnrollment & {
    history?: EnrollmentHistoryEntry[];
    lastMessageId?: string;
    lastChannel?: string;
    processedMessageIds?: string[];
  };

  const history = Array.isArray(prev.history) ? [...prev.history] : [];
  if (patch.historyEntry) {
    history.push(patch.historyEntry);
    // keep last 50
    while (history.length > 50) history.shift();
  }

  const updated: SequenceEnrollment & Record<string, unknown> = {
    ...prev,
    ...(patch.lastSentAt ? { lastSentAt: patch.lastSentAt } : {}),
    ...(patch.nextRunAt ? { nextRunAt: patch.nextRunAt } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.lastMessageId ? { lastMessageId: patch.lastMessageId } : {}),
    ...(patch.lastChannel ? { lastChannel: patch.lastChannel } : {}),
    ...(patch.processedMessageIds
      ? { processedMessageIds: patch.processedMessageIds }
      : {}),
    ...(patch.lastReplySnippet
      ? { lastReplySnippet: patch.lastReplySnippet }
      : {}),
    ...(patch.lastReplyAt ? { lastReplyAt: patch.lastReplyAt } : {}),
    ...(patch.lastReplyClassification
      ? { lastReplyClassification: patch.lastReplyClassification }
      : {}),
    history,
    updatedAt: new Date().toISOString(),
  };

  await putItem(tableNames.profiles, updated);
  return updated as SequenceEnrollment;
}

export { defaultSteps };
