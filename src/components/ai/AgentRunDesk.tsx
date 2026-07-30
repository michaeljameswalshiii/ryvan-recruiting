'use client';

/**
 * Agent Desk — goal-driven multi-step runs with a live results rail.
 * Uses /api/bedrock with agentMode (higher tool iterations, optional write approval).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Building2,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Pause,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  User,
  Briefcase,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  explainAiFetchError,
  parseAiFetchResponse,
} from '@/lib/ai/parse-response';
import {
  buildSlimApiHistory,
  clampMessageContent,
  scheduleCrmCacheInvalidation,
} from '@/lib/ai/chat-client-perf';
import {
  type AgentArtifact,
  type AgentRunSnapshot,
  type AgentStep,
  assistantSuggestsMoreWork,
  emptyAgentRun,
  newAgentId,
} from '@/lib/ai/agent-run-types';
import { AgentWorkbench } from '@/components/ai/AgentWorkbench';

const GOAL_EXAMPLES = [
  'Create CRM companies for these aerospace suppliers: Grace Aerospace, Matrix Composites, Primus Pipe & Tube, Becker Avionics (minimal records if websites fail)',
  'Find and add 5 HVAC companies in Florida with domains when possible',
  'Research this company website and create a company record if solid',
];

function nowIso() {
  return new Date().toISOString();
}

function statusBadge(status: AgentRunSnapshot['status']) {
  switch (status) {
    case 'running':
    case 'planning':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'awaiting_approval':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'failed':
    case 'cancelled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'paused':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function kindIcon(kind: AgentArtifact['kind']) {
  switch (kind) {
    case 'company':
      return Building2;
    case 'contact':
    case 'candidate':
    case 'apollo_hit':
      return User;
    case 'job':
      return Briefcase;
    case 'error':
      return AlertTriangle;
    default:
      return Sparkles;
  }
}

export function AgentRunDesk() {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState('');
  const [run, setRun] = useState<AgentRunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [showListBuilder, setShowListBuilder] = useState(false);
  const abortRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  const updateRun = useCallback((patch: Partial<AgentRunSnapshot> | ((r: AgentRunSnapshot) => AgentRunSnapshot)) => {
    setRun((prev) => {
      if (!prev) return prev;
      const next =
        typeof patch === 'function'
          ? patch(prev)
          : { ...prev, ...patch, updatedAt: nowIso() };
      runRef.current = next;
      return next;
    });
  }, []);

  const appendStep = useCallback(
    (step: Omit<AgentStep, 'id' | 'at' | 'index'>) => {
      setRun((prev) => {
        if (!prev) return prev;
        const s: AgentStep = {
          ...step,
          id: newAgentId('step'),
          index: prev.steps.length + 1,
          at: nowIso(),
        };
        const next = {
          ...prev,
          steps: [...prev.steps, s],
          updatedAt: nowIso(),
        };
        runRef.current = next;
        return next;
      });
    },
    []
  );

  const runWave = useCallback(
    async (opts: {
      goal: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
      writeApproved: boolean;
      wave: number;
    }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const historyForApi = buildSlimApiHistory([
          ...opts.history,
          { role: 'user', content: opts.userMessage },
        ]);

        const res = await fetch('/api/bedrock', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: historyForApi,
            provider: 'bedrock',
            model: 'auto',
            generalMode: true,
            agentMode: true,
            agentWriteApproved: opts.writeApproved,
            agentMaxIterations: 10,
            agentGoal: opts.goal,
            useTools: true,
          }),
        });

        const { data, errorMessage } = await parseAiFetchResponse(res);
        if (errorMessage || data.error) {
          throw new Error(
            errorMessage || String(data.message || data.error || 'Agent wave failed')
          );
        }

        const text = clampMessageContent(
          (typeof data.response === 'string' && data.response) ||
            'No response from agent.',
          12_000
        );
        const toolsUsed: string[] = Array.isArray(data.toolsUsed)
          ? data.toolsUsed.map(String)
          : [];
        const rawArts = Array.isArray(data.agentArtifacts)
          ? (data.agentArtifacts as AgentArtifact[])
          : [];
        const needsApproval = rawArts.some(
          (a) =>
            a.kind === 'note' &&
            /needs approval/i.test(a.title || '')
        ) || (!opts.writeApproved && toolsUsed.some((t) => /^(create_|update_|link_)/.test(t)) && !data.crmMutated);

        const goalComplete = data.goalComplete === true;
        const goalContinue =
          data.goalContinue === true ||
          (!goalComplete && assistantSuggestsMoreWork(text));

        return {
          text,
          toolsUsed,
          artifacts: rawArts,
          crmMutated: data.crmMutated === true,
          goalComplete,
          goalContinue,
          needsApproval,
          modelLabel:
            typeof data.modelLabel === 'string' ? data.modelLabel : undefined,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    []
  );

  const startRun = async () => {
    const g = goal.trim();
    if (!g || busy) return;
    abortRef.current = false;
    const base = emptyAgentRun(g);
    base.status = 'running';
    base.wave = 1;
    base.messages = [{ role: 'user', content: g }];
    setRun(base);
    runRef.current = base;
    setBusy(true);

    appendStep({
      title: 'Wave 1 — executing toward goal',
      detail: g.slice(0, 160),
      status: 'running',
    });

    try {
      const result = await runWave({
        goal: g,
        history: [],
        userMessage: g,
        writeApproved: false,
        wave: 1,
      });

      if (abortRef.current) {
        updateRun({ status: 'cancelled' });
        return;
      }

      setRun((prev) => {
        if (!prev) return prev;
        const steps = prev.steps.map((s, i) =>
          i === prev.steps.length - 1
            ? {
                ...s,
                status: 'done' as const,
                toolsUsed: result.toolsUsed,
                detail: result.text.slice(0, 280),
              }
            : s
        );
        const next: AgentRunSnapshot = {
          ...prev,
          steps,
          artifacts: [...prev.artifacts, ...result.artifacts],
          messages: [
            ...prev.messages,
            { role: 'assistant', content: result.text },
          ],
          lastAssistantText: result.text,
          writeApproved: prev.writeApproved,
          status: result.goalComplete
            ? 'completed'
            : result.needsApproval
              ? 'awaiting_approval'
              : result.goalContinue
                ? 'paused'
                : 'completed',
          updatedAt: nowIso(),
        };
        runRef.current = next;
        return next;
      });

      if (result.crmMutated) {
        scheduleCrmCacheInvalidation(queryClient, result.toolsUsed, {
          forceAll: true,
          delayMs: 600,
        });
      }

      if (result.needsApproval) {
        toast.message('Approve writes to let the agent create CRM records');
      } else if (result.goalComplete) {
        toast.success('Agent goal complete');
      } else if (result.goalContinue) {
        toast.message('Wave finished — continue or approve writes to proceed');
      }
    } catch (e) {
      const msg = explainAiFetchError(e);
      updateRun({ status: 'failed', error: msg });
      appendStep({
        title: 'Wave failed',
        detail: msg,
        status: 'error',
      });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const continueRun = async (opts?: { approveWrites?: boolean }) => {
    const current = runRef.current;
    if (!current || busy) return;
    if (current.wave >= current.maxWaves) {
      toast.error(`Max ${current.maxWaves} waves reached — start a new goal`);
      updateRun({ status: 'completed' });
      return;
    }

    abortRef.current = false;
    const writeApproved = !!(opts?.approveWrites || current.writeApproved);
    const wave = current.wave + 1;
    const userMessage = writeApproved
      ? `Continue the agent run. Writes are APPROVED (confirmed:true). Goal:\n${current.goal}\n\nMake maximum progress. End with GOAL_COMPLETE or GOAL_CONTINUE.`
      : `Continue the agent run toward the goal. Preview any writes if not approved yet.\nGoal:\n${current.goal}`;

    setBusy(true);
    updateRun({
      status: 'running',
      wave,
      writeApproved,
      error: undefined,
    });
    appendStep({
      title: `Wave ${wave} — ${writeApproved ? 'executing with writes approved' : 'continuing'}`,
      status: 'running',
    });

    try {
      const result = await runWave({
        goal: current.goal,
        history: current.messages,
        userMessage,
        writeApproved,
        wave,
      });

      if (abortRef.current) {
        updateRun({ status: 'cancelled' });
        return;
      }

      setRun((prev) => {
        if (!prev) return prev;
        const steps = prev.steps.map((s, i) =>
          i === prev.steps.length - 1
            ? {
                ...s,
                status: 'done' as const,
                toolsUsed: result.toolsUsed,
                detail: result.text.slice(0, 280),
              }
            : s
        );
        const next: AgentRunSnapshot = {
          ...prev,
          steps,
          wave,
          writeApproved,
          artifacts: [...prev.artifacts, ...result.artifacts],
          messages: [
            ...prev.messages,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: result.text },
          ],
          lastAssistantText: result.text,
          status: result.goalComplete
            ? 'completed'
            : result.needsApproval && !writeApproved
              ? 'awaiting_approval'
              : result.goalContinue
                ? 'paused'
                : 'completed',
          updatedAt: nowIso(),
        };
        runRef.current = next;
        return next;
      });

      if (result.crmMutated) {
        scheduleCrmCacheInvalidation(queryClient, result.toolsUsed, {
          forceAll: true,
          delayMs: 600,
        });
      }

      if (result.goalComplete) toast.success('Agent goal complete');
    } catch (e) {
      const msg = explainAiFetchError(e);
      updateRun({ status: 'failed', error: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const approveAndContinue = () => {
    void continueRun({ approveWrites: true });
  };

  const cancelRun = () => {
    abortRef.current = true;
    updateRun({ status: 'cancelled' });
    setBusy(false);
    toast.message('Agent run cancelled');
  };

  const resetRun = () => {
    abortRef.current = true;
    setRun(null);
    setBusy(false);
  };

  // Auto-continue when write-approved and paused with more work
  useEffect(() => {
    if (!run || busy) return;
    if (run.status !== 'paused') return;
    if (!run.writeApproved) return;
    if (run.wave >= run.maxWaves) return;
    // Don't infinite loop — only auto once per pause if user already approved
    // Require explicit Continue for safety (user asked for agentic but still controllable)
  }, [run, busy]);

  const companies = (run?.artifacts || []).filter((a) => a.kind === 'company');
  const people = (run?.artifacts || []).filter(
    (a) => a.kind === 'contact' || a.kind === 'candidate' || a.kind === 'apollo_hit'
  );
  const errors = (run?.artifacts || []).filter((a) => a.kind === 'error');

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col bg-slate-100 lg:flex-row">
      {/* ── Left: goal + steps + log ─────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-slate-200/80 bg-gradient-to-b from-slate-50 to-white">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-5 py-3.5 pt-12 backdrop-blur sm:px-6 sm:pt-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                Agent Desk
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800">
                <Rocket className="h-3 w-3" />
                Multi-step runs
              </span>
              {run && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(run.status)}`}
                >
                  {run.status.replace(/_/g, ' ')}
                  {run.wave > 0 ? ` · wave ${run.wave}/${run.maxWaves}` : ''}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Set a goal — the agent plans and uses tools across waves. Approve
              writes once to create CRM records without saying “yes” each batch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {run && (
              <Button type="button" variant="outline" size="sm" onClick={resetRun}>
                New goal
              </Button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-4">
          {/* Goal composer */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              disabled={busy || (run?.status === 'running')}
              placeholder="e.g. Create CRM companies for these 8 aerospace suppliers with domains when possible…"
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {!run || run.status === 'idle' || run.status === 'cancelled' || run.status === 'failed' || run.status === 'completed' ? (
                <Button
                  type="button"
                  className="bg-violet-700 hover:bg-violet-800"
                  disabled={busy || !goal.trim()}
                  onClick={() => void startRun()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start agent run
                </Button>
              ) : (
                <>
                  {(run.status === 'paused' ||
                    run.status === 'awaiting_approval') && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void continueRun()}
                      className="bg-slate-900 hover:bg-slate-800"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Continue wave
                    </Button>
                  )}
                  {!run.writeApproved &&
                    (run.status === 'awaiting_approval' ||
                      run.status === 'paused' ||
                      run.status === 'running') && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={approveAndContinue}
                        className="bg-emerald-700 hover:bg-emerald-800"
                      >
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Approve writes & continue
                      </Button>
                    )}
                  {run.status === 'running' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelRun}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>
            {!run && (
              <div className="mt-3 flex flex-col gap-1.5">
                <p className="text-[11px] font-medium text-slate-500">
                  Example goals
                </p>
                {GOAL_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setGoal(ex)}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-600 hover:border-violet-200 hover:bg-violet-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Steps */}
          {run && run.steps.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Run log</h2>
              <ol className="mt-3 space-y-2">
                {run.steps.map((s) => (
                  <li
                    key={s.id}
                    className="flex gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                  >
                    <div className="mt-0.5 shrink-0">
                      {s.status === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                      ) : s.status === 'done' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : s.status === 'error' ? (
                        <XCircle className="h-4 w-4 text-rose-600" />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {s.index}. {s.title}
                      </div>
                      {s.detail && (
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-3 whitespace-pre-wrap">
                          {s.detail}
                        </p>
                      )}
                      {!!s.toolsUsed?.length && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.toolsUsed.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Latest assistant narrative */}
          {run?.lastAssistantText && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Bot className="h-4 w-4" />
                Agent summary
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {run.lastAssistantText.replace(/\n?GOAL_(COMPLETE|CONTINUE)\s*$/i, '')}
              </p>
              {run.error && (
                <p className="mt-2 text-sm text-rose-600">{run.error}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Right: results rail ───────────────────────────────────── */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-slate-800 bg-slate-950 lg:w-[min(100%,420px)] lg:border-t-0 xl:w-[460px]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Live results</h2>
            <p className="text-[11px] text-slate-400">
              Companies, people, and tool outcomes from this run
            </p>
          </div>
          <div className="flex gap-3 text-[11px] text-slate-400">
            <span>{companies.length} cos</span>
            <span>{people.length} people</span>
            {errors.length > 0 && (
              <span className="text-rose-400">{errors.length} err</span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {!run || run.artifacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-slate-500" />
              <p className="mt-2 text-sm text-slate-400">
                Artifacts appear here as the agent creates companies, contacts,
                or finds Apollo hits.
              </p>
            </div>
          ) : (
            [...run.artifacts].reverse().map((a) => {
              const Icon = kindIcon(a.kind);
              const body = (
                <div className="flex gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {a.title}
                    </div>
                    {a.subtitle && (
                      <div className="truncate text-[11px] text-slate-400">
                        {a.subtitle}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                      {a.kind.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              );
              return a.href ? (
                <Link key={a.id + a.at} href={a.href} className="block">
                  {body}
                </Link>
              ) : (
                <div key={a.id + a.at}>{body}</div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setShowListBuilder((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            <span>Apollo / list builder jobs</span>
            <span className="text-slate-500">
              {showListBuilder ? 'Hide' : 'Show'}
            </span>
          </button>
          {showListBuilder && (
            <div className="mt-2 max-h-[min(40vh,360px)] overflow-y-auto rounded-xl border border-white/10">
              <AgentWorkbench variant="compact" />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default AgentRunDesk;
