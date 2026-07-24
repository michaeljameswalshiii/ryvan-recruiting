/**
 * AI tools: start / inspect BD list-builder jobs.
 * @serverOnly
 */

import type { ToolContext, ToolResult } from './types';
import {
  canManageListBuilderJob,
  canViewListBuilderJob,
  createListBuilderJob,
  getListBuilderJob,
  listJobsForUser,
  setJobStatus,
} from '@/lib/db/repositories/list-builder-repository';
import { processListBuilderBatch } from '@/lib/list-builder/runner';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
}

export async function executeStartListBuilder(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.tenantId || !context.userId) {
    return { success: false, error: 'Sign in required' };
  }
  const p = (params || {}) as Record<string, unknown>;
  const brief = str(p.brief) || str(p.description) || str(p.query);
  if (!brief) {
    return {
      success: false,
      error:
        'brief is required (industry + who to reach). Geography defaults to United States if omitted; ask for targetSize if user did not specify.',
    };
  }

  const targetSize = p.target_size ?? p.targetSize;
  const geography = str(p.geography) || str(p.geo) || LIST_BUILDER_DEFAULTS.geography;
  const visRaw = str(p.visibility || p.sharing).toLowerCase();
  const visibility =
    visRaw === 'public' || visRaw === 'shared'
      ? 'public'
      : visRaw === 'private'
        ? 'private'
        : undefined;

  const { job, error } = await createListBuilderJob(
    context.tenantId,
    context.userId,
    {
      brief,
      industry: str(p.industry) || undefined,
      geography,
      targetSize:
        targetSize != null && targetSize !== ''
          ? Number(targetSize)
          : LIST_BUILDER_DEFAULTS.targetSize,
      visibility,
    }
  );
  if (error || !job) {
    return { success: false, error: error || 'Failed to start job' };
  }

  // First batch
  try {
    await processListBuilderBatch(context.tenantId, job.id);
  } catch (err) {
    console.error('[tool start_list_builder] batch', err);
  }
  const fresh = await getListBuilderJob(context.tenantId, job.id);

  return {
    success: true,
    data: {
      status: 'started',
      job: {
        id: fresh?.id || job.id,
        status: fresh?.status,
        targetSize: fresh?.targetSize,
        geography: fresh?.geography,
        found: fresh?.results?.length || 0,
        message:
          'BD list builder is running in the background. The user can keep chatting; open the Jobs queue in AI Assistant to watch progress, pause/cancel, and import when ready.',
      },
    },
    metadata: { action: 'start_list_builder', id: job.id },
  };
}

export async function executeListBuilderStatus(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.tenantId || !context.userId) {
    return { success: false, error: 'Sign in required' };
  }
  const p = (params || {}) as Record<string, unknown>;
  const jobId = str(p.job_id) || str(p.jobId) || str(p.id);
  if (jobId) {
    const job = await getListBuilderJob(context.tenantId, jobId);
    if (!job || !canViewListBuilderJob(job, context.userId)) {
      return { success: false, error: 'Job not found' };
    }
    return {
      success: true,
      data: {
        job: {
          id: job.id,
          status: job.status,
          found: job.results.length,
          target: job.targetSize,
          lastMessage: job.progress.lastMessage,
          sample: job.results.slice(0, 5),
        },
      },
    };
  }
  const jobs = await listJobsForUser(context.tenantId, context.userId);
  return {
    success: true,
    data: {
      jobs: jobs.slice(0, 10).map((j) => ({
        id: j.id,
        status: j.status,
        visibility: j.visibility || 'private',
        brief: j.brief.slice(0, 80),
        found: j.results.length,
        target: j.targetSize,
        owner: j.userId === context.userId ? 'you' : 'teammate',
      })),
    },
  };
}

export async function executeListBuilderControl(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.tenantId || !context.userId) {
    return { success: false, error: 'Sign in required' };
  }
  const p = (params || {}) as Record<string, unknown>;
  const jobId = str(p.job_id) || str(p.jobId) || str(p.id);
  const action = str(p.action).toLowerCase();
  if (!jobId || !action) {
    return { success: false, error: 'job_id and action (pause|resume|cancel) required' };
  }
  const job = await getListBuilderJob(context.tenantId, jobId);
  if (!job || !canManageListBuilderJob(job, context.userId)) {
    return { success: false, error: 'Job not found or not owned by you' };
  }
  if (action === 'pause') {
    await setJobStatus(context.tenantId, jobId, 'paused');
  } else if (action === 'cancel') {
    await setJobStatus(context.tenantId, jobId, 'cancelled');
  } else if (action === 'resume') {
    await setJobStatus(context.tenantId, jobId, 'running');
    await processListBuilderBatch(context.tenantId, jobId);
  } else {
    return { success: false, error: 'action must be pause, resume, or cancel' };
  }
  const fresh = await getListBuilderJob(context.tenantId, jobId);
  return {
    success: true,
    data: { job: { id: jobId, status: fresh?.status, found: fresh?.results.length } },
  };
}

export const LIST_BUILDER_TOOLS = [
  {
    name: 'start_list_builder',
    description:
      'Start a background BD list-builder job: find companies + contacts for recruiting outreach (web research, no invented emails/phones). ' +
      'Defaults: geography United States, target 50 if not specified. User can leave and come back; results show in AI Assistant Jobs queue. ' +
      'After completion user reviews a table and chooses what to import to Companies (Identification) + Contacts.',
    execute: executeStartListBuilder,
    schema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Market description (industry, who to contact, intent)' },
        industry: { type: 'string' },
        geography: { type: 'string', description: 'Default United States' },
        target_size: {
          type: 'number',
          description:
            'How many companies (default 50, max 100). If omitted, parse from brief e.g. "100 construction companies".',
        },
        visibility: {
          type: 'string',
          description:
            'private (default, only you) or public (shared with all teammates on the same tenant)',
        },
      },
      required: ['brief'],
    },
  },
  {
    name: 'list_builder_status',
    description:
      'List list-builder jobs visible to you (own + public team lists) or get one job by job_id.',
    execute: executeListBuilderStatus,
    schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
      },
    },
  },
  {
    name: 'list_builder_control',
    description: 'Pause, resume, or cancel a list-builder job.',
    execute: executeListBuilderControl,
    schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        action: { type: 'string', description: 'pause | resume | cancel' },
      },
      required: ['job_id', 'action'],
    },
  },
];
