/**
 * AI tool: source people to fill a job (careers URL or brief)
 * @serverOnly
 */

import type { ToolContext, ToolParams, ToolResult } from './types';
import { sourceCandidatesForJob } from '@/lib/sourcing/job-candidate-search';

export const SOURCE_CANDIDATES_TOOL_NAME = 'source_candidates';
export const SOURCE_CANDIDATES_TOOL_DESCRIPTION =
  'Find people who could fill a job posting. Pass a Trio careers job URL ' +
  '(/careers/{tenant}/{jobId}), a job_id, or a role brief (title + location + skills). ' +
  'Uses Apollo/PDL for real candidates — not web pages about the URL. ' +
  'Always show name, title, company, LinkedIn/email and cite source.';

export async function executeSourceCandidates(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const p = (params || {}) as Record<string, unknown>;
  const input = String(
    p.input || p.query || p.url || p.job_url || p.brief || ''
  ).trim();
  const jobId = p.job_id || p.jobId ? String(p.job_id || p.jobId) : undefined;

  if (!input && !jobId) {
    return {
      success: false,
      error:
        'Provide a careers job URL, job_id, or role brief (title + location)',
    };
  }

  const result = await sourceCandidatesForJob({
    input: input || String(jobId),
    jobId,
    tenantId: context.tenantId,
    userId: context.userId,
    limit: p.limit != null ? Number(p.limit) : 12,
  });

  if (context.toolSpend) {
    context.toolSpend.push({
      tool: SOURCE_CANDIDATES_TOOL_NAME,
      estimatedCostUsd: result.estimatedCostUsd,
      label: result.job?.title || 'source candidates',
    });
  } else {
    context.toolSpend = [
      {
        tool: SOURCE_CANDIDATES_TOOL_NAME,
        estimatedCostUsd: result.estimatedCostUsd,
        label: result.job?.title || 'source candidates',
      },
    ];
  }

  if (!result.ok && !result.candidates.length) {
    return {
      success: false,
      error: result.error || 'No candidates found',
      data: {
        job: result.job,
        notes: result.notes,
        estimatedCostUsd: result.estimatedCostUsd,
      },
    };
  }

  return {
    success: true,
    data: {
      job: result.job,
      candidates: result.candidates,
      count: result.candidates.length,
      notes: result.notes,
      estimatedCostUsd: result.estimatedCostUsd,
      costs: result.costs,
    },
    metadata: { estimatedCostUsd: result.estimatedCostUsd },
  };
}

export function formatSourceCandidatesForModel(data: {
  job?: { title?: string; location?: string };
  candidates?: Array<{
    name?: string;
    title?: string;
    company?: string;
    location?: string;
    email?: string;
    linkedinUrl?: string;
    source?: string;
  }>;
  estimatedCostUsd?: number;
  notes?: string[];
}): string {
  const people = data.candidates || [];
  const lines = people.slice(0, 15).map((c, i) => {
    const parts = [
      `${i + 1}. ${c.name || 'Unknown'}`,
      c.title ? ` — ${c.title}` : '',
      c.company ? ` @ ${c.company}` : '',
      c.location ? ` (${c.location})` : '',
      c.email ? `\n   Email: ${c.email}` : '',
      c.linkedinUrl ? `\n   LinkedIn: ${c.linkedinUrl}` : '',
      c.source ? `\n   Source: ${c.source}` : '',
    ];
    return parts.join('');
  });
  return [
    `Candidates for: ${data.job?.title || 'role'}` +
      (data.job?.location ? ` · ${data.job.location}` : ''),
    `Cost ~$${(data.estimatedCostUsd || 0).toFixed(4)} · ${people.length} people`,
    ...(data.notes || []).slice(0, 4),
    '',
    ...lines,
    '',
    'These are people who may fit the posting — not web articles about the job URL.',
  ].join('\n');
}
