'use client';

/**
 * Dedicated job pipeline page — full list of candidates on this req,
 * filterable by WIP bucket (Attached / Submitted / Interviewing / …).
 * Linked from job detail WIP tracker tiles.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Trash2,
  Users,
} from 'lucide-react';
import {
  useJob,
  useUnlinkCandidateFromJob,
  useUpdateCandidateStageInJob,
} from '@/lib/hooks/query-job';
import {
  APPLICATION_STAGES,
  getStageLabel,
} from '@/lib/schemas/lead';
import {
  PIPELINE_BUCKETS,
  candidateMatchesBucket,
  getPipelineBucket,
  isPipelineBucketKey,
  pipelineHref,
  type PipelineBucketKey,
} from '@/lib/jobs/pipeline-buckets';
import { FitScoreBadge } from '@/components/job/FitScoreBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const STAGES = APPLICATION_STAGES.map((s) => s.value);

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const palette = [
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-orange-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * 17) % palette.length;
  }
  return palette[hash];
}

export default function JobPipelinePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = params?.id || '';

  const stageParam = searchParams.get('stage');
  const activeKey: PipelineBucketKey = isPipelineBucketKey(stageParam)
    ? stageParam
    : 'attached';

  const { data: job, isLoading, isError, error } = useJob(jobId);
  const updateStage = useUpdateCandidateStageInJob();
  const unlinkCandidate = useUnlinkCandidateFromJob();
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const linkedCandidates = useMemo(() => {
    if (!job) return [] as any[];
    if (Array.isArray(job.linkedCandidates)) return job.linkedCandidates;
    if (Array.isArray(job.candidates)) return job.candidates;
    return [];
  }, [job]);

  const activeBucket =
    getPipelineBucket(activeKey) || PIPELINE_BUCKETS[0];

  const pipelineCounts = useMemo(() => {
    const total = linkedCandidates.length;
    return PIPELINE_BUCKETS.map((bucket) => {
      if (bucket.match === null) {
        return { ...bucket, count: total };
      }
      const count = linkedCandidates.filter((lc: any) =>
        candidateMatchesBucket(lc.stage, bucket)
      ).length;
      return { ...bucket, count };
    });
  }, [linkedCandidates]);

  const filtered = useMemo(() => {
    return linkedCandidates.filter((lc: any) =>
      candidateMatchesBucket(lc.stage, activeBucket)
    );
  }, [linkedCandidates, activeBucket]);

  const setStageFilter = (key: PipelineBucketKey) => {
    router.replace(pipelineHref(jobId, key), { scroll: false });
  };

  const jobTitle = job?.title || job?.jobTitle || 'Job';
  const companyName = job?.companyName || job?.company_name || '';

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-3">
        <p className="text-slate-700 dark:text-slate-200">
          {error instanceof Error ? error.message : 'Job not found'}
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard/jobs">Back to jobs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      {/* Header sits on page canvas (dark in black theme) — use light ink in dark mode */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to job
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
            Pipeline
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 truncate">
            {jobTitle}
            {companyName ? (
              <span className="text-slate-400 dark:text-slate-400">
                {' '}
                · {companyName}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {/* Solid white pill — always readable on dark canvas (outline + dark:bg-slate was invisible) */}
          <Link
            href={`/dashboard/jobs/${jobId}`}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-semibold border border-white/90 bg-white text-slate-900 shadow-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderColor: '#e2e8f0',
            }}
          >
            Job overview
          </Link>
        </div>
      </div>

      {/* Stage filter tiles */}
      <section
        data-ink-on-light
        className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Filter by stage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Same buckets as the job WIP tracker
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {filtered.length} shown
            {activeKey !== 'attached'
              ? ` · ${linkedCandidates.length} total attached`
              : ` attached`}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {pipelineCounts.map((bucket) => {
            const isActive = activeKey === bucket.key;
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setStageFilter(bucket.key)}
                className={`rounded-xl ${bucket.bg} ring-1 ${bucket.ring} px-3 py-3 text-center transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive ? 'ring-2 ring-blue-500 shadow-sm scale-[1.02]' : ''
                }`}
              >
                <div
                  className={`text-2xl font-semibold tabular-nums ${bucket.text}`}
                >
                  {bucket.count}
                </div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mt-0.5">
                  {bucket.label}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Full candidate table */}
      <section
        data-ink-on-light
        className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 bg-slate-50/60">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            {activeBucket.label}
            <span className="text-slate-400 font-normal normal-case tracking-normal text-xs">
              ({filtered.length})
            </span>
          </h2>
          {activeKey !== 'attached' && (
            <button
              type="button"
              onClick={() => setStageFilter('attached')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Show all attached
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-600">
              No candidates in{' '}
              <span className="font-medium text-slate-800">
                {activeBucket.label}
              </span>
              .
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {activeKey !== 'attached' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStageFilter('attached')}
                >
                  Show all attached
                </Button>
              )}
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href={`/dashboard/jobs/${jobId}`}>Back to job</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-44">
                    Stage
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-28">
                    Fit
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-28 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((lc: any) => {
                  const cid = lc.candidateId || lc.id;
                  const name = lc.candidateName || lc.name || 'Unknown';
                  const stage = lc.stage || 'sourced';
                  const email = lc.email || lc.candidateEmail;
                  const fitScore =
                    typeof lc.fitScore === 'number' ? lc.fitScore : null;
                  const fitGrade = lc.fitGrade;
                  const fitDomainScore =
                    typeof lc.fitDomainScore === 'number'
                      ? lc.fitDomainScore
                      : null;
                  const fitToolScore =
                    typeof lc.fitToolScore === 'number' ? lc.fitToolScore : null;
                  const isUnlinking = unlinkingId === cid;

                  return (
                    <tr key={cid} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(name)} text-white flex items-center justify-center text-xs font-semibold`}
                          >
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/candidates/${cid}?jobId=${encodeURIComponent(jobId)}`}
                              className="font-medium text-blue-600 hover:underline truncate block"
                            >
                              {name}
                            </Link>
                            {email && (
                              <p className="text-xs text-slate-500 truncate">
                                {email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full max-w-[11rem] h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={STAGES.includes(stage) ? stage : stage}
                          onChange={(e) =>
                            updateStage.mutate({
                              jobId,
                              candidateId: cid,
                              stage: e.target.value,
                            })
                          }
                          disabled={updateStage.isPending}
                          aria-label={`Stage for ${name}`}
                        >
                          {!STAGES.includes(stage) && (
                            <option value={stage}>{getStageLabel(stage)}</option>
                          )}
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {getStageLabel(s)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <FitScoreBadge
                          score={fitScore}
                          grade={fitGrade}
                          domainFit={
                            fitDomainScore != null
                              ? {
                                  score: fitDomainScore,
                                  grade: lc.fitDomainGrade,
                                }
                              : null
                          }
                          toolReadiness={
                            fitDomainScore != null
                              ? {
                                  score: fitToolScore ?? 100,
                                  grade: lc.fitToolGrade,
                                  applicable: lc.fitToolApplicable !== false,
                                }
                              : null
                          }
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-slate-700"
                          >
                            <Link href={`/dashboard/candidates/${cid}?jobId=${encodeURIComponent(jobId)}`}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Open
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                            title="Unlink from job"
                            disabled={isUnlinking || unlinkCandidate.isPending}
                            onClick={async () => {
                              if (!cid) return;
                              setUnlinkingId(cid);
                              try {
                                await unlinkCandidate.mutateAsync({
                                  jobId,
                                  candidateId: cid,
                                });
                              } finally {
                                setUnlinkingId(null);
                              }
                            }}
                          >
                            {isUnlinking ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
