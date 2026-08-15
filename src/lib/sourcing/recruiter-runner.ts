import { sourceCandidatesForJob } from '@/lib/sourcing/job-candidate-search';
import { getRecruiterAgentConfig, getRecruiterAgentUsage } from '@/lib/db/repositories/recruiter-agent-repository';
import { getRecruiterRun, updateRecruiterRun } from '@/lib/db/repositories/recruiter-run-repository';
import { createFillJobRun } from '@/lib/db/repositories/fill-job-run-repository';

function candidateKey(candidate: any) {
  return String(candidate.id || candidate.linkedinUrl || `${candidate.name}|${candidate.title || ''}|${candidate.company || ''}`).toLowerCase();
}

const WIDENING_ORDER = ['exact', '10', '25', '50', '100', 'state'] as const;

function nextRadius(current: string) {
  const index = WIDENING_ORDER.indexOf(current as (typeof WIDENING_ORDER)[number]);
  return index >= 0 && index < WIDENING_ORDER.length - 1 ? WIDENING_ORDER[index + 1] : null;
}

export async function processRecruiterRunBatch(tenantId: string, runId: string) {
  const run = await getRecruiterRun(tenantId, runId);
  if (!run || ['paused', 'cancelled', 'completed', 'failed'].includes(run.status)) {
    return { done: true, run };
  }

  const config = await getRecruiterAgentConfig(tenantId);
  if (!config.enabled || config.paused) {
    const paused = await updateRecruiterRun(tenantId, run.id, {
      status: 'paused',
      lastMessage: 'Paused automatically: recruiter sourcing is disabled in Agent Controls.',
    });
    return { done: true, run: paused };
  }
  const usage = await getRecruiterAgentUsage(tenantId);
  if (usage.dayUsd >= config.dailyBudgetUsd || usage.monthUsd >= config.monthlyBudgetUsd) {
    const stopped = await updateRecruiterRun(tenantId, run.id, {
      status: 'paused',
      lastMessage: 'Paused automatically: recruiter-agent budget reached.',
    });
    return { done: true, run: stopped };
  }

  const locked = await updateRecruiterRun(tenantId, run.id, {
    status: 'running',
    lockedUntil: new Date(Date.now() + 55_000).toISOString(),
    startedAt: run.startedAt || new Date().toISOString(),
    lastMessage: `Searching Apollo page ${run.pageOffset + 1}...`,
  });
  if (!locked) return { done: true };

  try {
    const result = await sourceCandidatesForJob({
      input: run.query,
      jobId: run.jobId,
      tenantId,
      userId: run.userId,
      limit: run.batchSize,
      pageOffset: run.pageOffset,
      location: run.location,
      locationRadius: run.locationRadius,
      apolloPlanOverride: run.apolloPlan as any,
    });
    const merged = new Map(run.candidates.map((candidate) => [candidateKey(candidate), candidate]));
    for (const candidate of result.candidates) merged.set(candidateKey(candidate), {
      ...candidate,
      searchStage: candidate.searchStage || run.locationRadius,
    });
    const candidates = [...merged.values()]
      .map((candidate) => {
        const feedback = run.feedback?.[candidateKey(candidate)];
        if (!feedback) return candidate;
        return {
          ...candidate,
          recruiterDisposition: feedback.decision,
          fitScore: feedback.decision === 'strong_fit'
            ? Math.min(100, (candidate.fitScore || 0) + 5)
            : candidate.fitScore,
        };
      })
      .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
      .slice(0, 120);
    const qualifiedCount = candidates.filter((candidate) =>
      !['not_fit', 'wrong_location', 'wrong_seniority'].includes(candidate.recruiterDisposition || '') &&
      (candidate.fitScore || 0) >= run.minFitScore
    ).length;
    const notes = [...new Set([...run.notes, ...(result.notes || [])])].slice(-80);
    const nextPageOffset = run.pageOffset + 2;
    const noNewCandidates = result.candidates.every((candidate) => run.candidates.some((old) => candidateKey(old) === candidateKey(candidate)));
    const exhausted = !result.candidates.length || noNewCandidates;
    const reached = qualifiedCount >= run.targetQualified;
    const widenedTo = exhausted && !reached && run.progressiveWidening
      ? nextRadius(run.locationRadius)
      : null;
    const status = reached || (exhausted && !widenedTo) ? 'completed' : 'queued';
    let next = await updateRecruiterRun(tenantId, run.id, {
      status,
      candidates,
      qualifiedCount,
      estimatedCostUsd: run.estimatedCostUsd + result.estimatedCostUsd,
      notes,
      pageOffset: widenedTo ? 0 : nextPageOffset,
      ...(widenedTo ? {
        locationRadius: widenedTo,
        radiusMiles: ['10', '25', '50', '100'].includes(widenedTo) ? Number(widenedTo) : undefined,
        wideningStage: run.wideningStage + 1,
        wideningHistory: [...run.wideningHistory, {
          from: run.locationRadius,
          to: widenedTo,
          at: new Date().toISOString(),
          reason: `Only ${qualifiedCount} of ${run.targetQualified} qualified candidates found.`,
        }].slice(-10),
      } : {}),
      apolloPlan: result.apolloPlan as any,
      apolloPlanSource: result.apolloPlanSource,
      lastMessage: reached
        ? `Target reached: ${qualifiedCount} qualified candidate(s).`
        : widenedTo
          ? `Search widened from ${run.locationRadius} to ${widenedTo}; hard role requirements remain unchanged.`
        : exhausted
          ? `Search exhausted with ${qualifiedCount} qualified candidate(s).`
          : `${qualifiedCount} / ${run.targetQualified} qualified candidate(s); continuing...`,
      ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      lockedUntil: undefined,
    });
    if (next?.status === 'completed' && next.candidates.length && !next.fillRunId) {
      const fillRun = await createFillJobRun(tenantId, run.userId, {
        query: run.query,
        visibility: run.visibility,
        candidates: next.candidates,
        estimatedCostUsd: next.estimatedCostUsd,
        notes: next.notes,
        apolloPlan: next.apolloPlan,
        apolloPlanSource: next.apolloPlanSource,
        usageLine: next.lastMessage,
      });
      next = (await updateRecruiterRun(tenantId, run.id, {
        fillRunId: fillRun.id,
      })) || next;
    }
    return { done: status === 'completed', run: next };
  } catch (error) {
    const failed = await updateRecruiterRun(tenantId, run.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Recruiter batch failed',
      lastMessage: 'Recruiter batch failed.',
      lockedUntil: undefined,
    });
    return { done: true, error, run: failed };
  }
}
