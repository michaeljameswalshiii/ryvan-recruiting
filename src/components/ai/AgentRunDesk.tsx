'use client';

/**
 * Agent Desk — goal-driven multi-step runs with interactive chat mid-run,
 * persisted history, light results rail (Apollo hits + CRM artifacts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Building2,
  CheckCircle2,
  CircleDashed,
  History,
  Loader2,
  Moon,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  Briefcase,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Trash2,
  Search,
  MessageSquare,
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
import {
  clearAgentRuns,
  deleteAgentRun,
  formatRunWhen,
  getActiveAgentRun,
  listAgentRuns,
  saveAgentRun,
} from '@/lib/ai/agent-run-history';
import { AgentWorkbench } from '@/components/ai/AgentWorkbench';

type DeskTab = 'companies' | 'fill' | 'goal';
type DeskTheme = 'light' | 'dark';

const THEME_KEY = 'trio-agent-desk-theme-v1';

const GOAL_EXAMPLES = [
  'Create CRM companies for: Grace Aerospace, Matrix Composites, Primus Pipe & Tube, Becker Avionics (minimal if websites fail)',
  'Search Apollo for HVAC companies in Florida, then create the top 5 as CRM companies',
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
      return User;
    case 'apollo_hit':
      return Search;
    case 'job':
      return Briefcase;
    case 'error':
      return AlertTriangle;
    default:
      return Sparkles;
  }
}

export function AgentRunDesk({
  onSwitchToChat,
}: {
  /** Optional: show Chat control in the dark/light app bar */
  onSwitchToChat?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  /** Primary Agent Desk surfaces — list builders live here (not on Chat) */
  const [deskTab, setDeskTab] = useState<DeskTab>('companies');
  const [theme, setTheme] = useState<DeskTheme>('light');
  const [goal, setGoal] = useState('');
  const [run, setRun] = useState<AgentRunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pastRuns, setPastRuns] = useState<AgentRunSnapshot[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const dark = theme === 'dark';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'dark' || raw === 'light') setTheme(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: DeskTheme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const refreshPast = useCallback(() => {
    setPastRuns(listAgentRuns(userId));
  }, [userId]);

  // Resolve user + restore last active / most recent run
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid: string | null = null;
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (data?.userId) uid = String(data.userId);
      } catch {
        /* anon storage */
      }
      if (cancelled) return;
      if (uid) setUserId(uid);
      const active = getActiveAgentRun(uid);
      if (active) {
        const restored: AgentRunSnapshot = {
          ...active,
          status:
            active.status === 'running' || active.status === 'planning'
              ? 'paused'
              : active.status,
        };
        setRun(restored);
        setGoal(restored.goal);
        runRef.current = restored;
      }
      setPastRuns(listAgentRuns(uid));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every run change
  useEffect(() => {
    if (!hydrated || !run) return;
    saveAgentRun(run, userId);
    refreshPast();
  }, [run, hydrated, userId, refreshPast]);

  // Persist on leave
  useEffect(() => {
    const flush = () => {
      if (runRef.current) saveAgentRun(runRef.current, userId);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [run?.messages?.length, run?.steps?.length, busy]);

  const updateRun = useCallback(
    (
      patch:
        | Partial<AgentRunSnapshot>
        | ((r: AgentRunSnapshot) => AgentRunSnapshot)
    ) => {
      setRun((prev) => {
        if (!prev) return prev;
        const next =
          typeof patch === 'function'
            ? patch(prev)
            : { ...prev, ...patch, updatedAt: nowIso() };
        runRef.current = next;
        return next;
      });
    },
    []
  );

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
            errorMessage ||
              String(data.message || data.error || 'Agent wave failed')
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
        const needsApproval =
          rawArts.some(
            (a) => a.kind === 'note' && /needs approval/i.test(a.title || '')
          ) ||
          (!opts.writeApproved &&
            toolsUsed.some((t) => /^(create_|update_|link_)/.test(t)) &&
            !data.crmMutated);

        const goalComplete = data.goalComplete === true;
        const goalContinue =
          data.goalContinue === true ||
          (!goalComplete && assistantSuggestsMoreWork(text));

        // Detect agent asking a question (interactive)
        const asksQuestion =
          /\?\s*$/.test(text.trim()) ||
          /should i|do you want|would you like|confirm|which ones|pick|choose/i.test(
            text
          );

        return {
          text,
          toolsUsed,
          artifacts: rawArts,
          crmMutated: data.crmMutated === true,
          goalComplete,
          goalContinue,
          needsApproval,
          asksQuestion,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    []
  );

  const applyWaveResult = useCallback(
    (
      prev: AgentRunSnapshot,
      result: {
        text: string;
        toolsUsed: string[];
        artifacts: AgentArtifact[];
        goalComplete: boolean;
        goalContinue: boolean;
        needsApproval: boolean;
        asksQuestion?: boolean;
        writeApproved: boolean;
        wave: number;
        userMessage: string;
      }
    ): AgentRunSnapshot => {
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

      let status: AgentRunSnapshot['status'] = 'paused';
      if (result.goalComplete) status = 'completed';
      else if (result.needsApproval && !result.writeApproved)
        status = 'awaiting_approval';
      else if (result.asksQuestion) status = 'paused'; // wait for user reply
      else if (result.goalContinue) status = 'paused';
      else status = 'completed';

      return {
        ...prev,
        steps,
        wave: result.wave,
        writeApproved: result.writeApproved,
        artifacts: [...prev.artifacts, ...result.artifacts],
        messages: [
          ...prev.messages,
          ...(result.userMessage &&
          prev.messages[prev.messages.length - 1]?.content !== result.userMessage
            ? [{ role: 'user' as const, content: result.userMessage }]
            : []),
          { role: 'assistant', content: result.text },
        ],
        lastAssistantText: result.text,
        status,
        updatedAt: nowIso(),
      };
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
    setReply('');

    appendStep({
      title: 'Wave 1 — working toward goal',
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
        // First user message already in base.messages
        const next = applyWaveResult(prev, {
          ...result,
          writeApproved: false,
          wave: 1,
          userMessage: g,
        });
        // Avoid duplicating user message
        next.messages = [
          { role: 'user', content: g },
          { role: 'assistant', content: result.text },
        ];
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
        toast.message('Approve writes so the agent can create CRM records');
      } else if (result.goalComplete) {
        toast.success('Goal complete');
      } else if (result.asksQuestion) {
        toast.message('Agent is waiting for your reply');
        replyRef.current?.focus();
      }
    } catch (e) {
      const msg = explainAiFetchError(e);
      updateRun({ status: 'failed', error: msg });
      appendStep({ title: 'Wave failed', detail: msg, status: 'error' });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  /** Continue wave OR reply interactively mid-run */
  const sendToAgent = async (opts?: {
    approveWrites?: boolean;
    message?: string;
  }) => {
    const current = runRef.current;
    if (!current || busy) return;
    if (current.wave >= current.maxWaves) {
      toast.error(`Max ${current.maxWaves} waves — start a new goal`);
      updateRun({ status: 'completed' });
      return;
    }

    abortRef.current = false;
    const writeApproved = !!(opts?.approveWrites || current.writeApproved);
    const wave = current.wave + 1;
    const freeText = (opts?.message ?? reply).trim();

    let userMessage: string;
    if (freeText) {
      userMessage = freeText;
    } else if (writeApproved && !current.writeApproved) {
      userMessage = `I approve CRM writes for this run (confirmed:true). Continue toward the goal:\n${current.goal}\nMake maximum progress. End with GOAL_COMPLETE or GOAL_CONTINUE.`;
    } else if (writeApproved) {
      userMessage = `Continue. Writes stay approved. Goal:\n${current.goal}\nEnd with GOAL_COMPLETE or GOAL_CONTINUE.`;
    } else {
      userMessage = `Continue toward the goal (preview writes if needed):\n${current.goal}`;
    }

    setBusy(true);
    setReply('');
    updateRun({
      status: 'running',
      wave,
      writeApproved,
      error: undefined,
    });
    appendStep({
      title: freeText
        ? `Your reply — wave ${wave}`
        : `Wave ${wave}${writeApproved ? ' (writes on)' : ''}`,
      detail: freeText ? freeText.slice(0, 160) : undefined,
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
        const next = applyWaveResult(prev, {
          ...result,
          writeApproved,
          wave,
          userMessage,
        });
        runRef.current = next;
        return next;
      });

      if (result.crmMutated) {
        scheduleCrmCacheInvalidation(queryClient, result.toolsUsed, {
          forceAll: true,
          delayMs: 600,
        });
      }

      if (result.goalComplete) toast.success('Goal complete');
      else if (result.asksQuestion) {
        toast.message('Agent is waiting for your reply');
        replyRef.current?.focus();
      }
    } catch (e) {
      const msg = explainAiFetchError(e);
      updateRun({ status: 'failed', error: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const cancelRun = () => {
    abortRef.current = true;
    updateRun({ status: 'cancelled' });
    setBusy(false);
    toast.message('Run cancelled — progress is saved in History');
  };

  const openPastRun = (r: AgentRunSnapshot) => {
    if (busy) return;
    if (runRef.current) saveAgentRun(runRef.current, userId);
    const restored: AgentRunSnapshot = {
      ...r,
      status:
        r.status === 'running' || r.status === 'planning' ? 'paused' : r.status,
    };
    setRun(restored);
    setGoal(restored.goal);
    runRef.current = restored;
    setHistoryOpen(false);
    toast.success('Restored agent run');
  };

  const newGoal = () => {
    if (runRef.current) saveAgentRun(runRef.current, userId);
    abortRef.current = true;
    setRun(null);
    setGoal('');
    setReply('');
    setBusy(false);
    refreshPast();
  };

  const companies = (run?.artifacts || []).filter((a) => a.kind === 'company');
  const apolloHits = (run?.artifacts || []).filter((a) => a.kind === 'apollo_hit');
  const people = (run?.artifacts || []).filter(
    (a) => a.kind === 'contact' || a.kind === 'candidate'
  );
  const errors = (run?.artifacts || []).filter((a) => a.kind === 'error');

  const canInteract =
    !!run &&
    !busy &&
    ['paused', 'awaiting_approval', 'failed', 'cancelled'].includes(run.status);

  const showChatComposer =
    !!run &&
    run.status !== 'completed' &&
    run.status !== 'idle';

  const tabBtn = (id: DeskTab, label: string, icon: React.ReactElement) => (
    <button
      type="button"
      onClick={() => setDeskTab(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
        deskTab === id
          ? 'bg-violet-600 text-white shadow-sm'
          : dark
            ? 'text-slate-300 hover:bg-white/10 hover:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const outlineBtn = dark
    ? 'h-8 border-white/15 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white'
    : 'h-8';

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100/80 text-slate-900'
      }`}
    >
      {/* Single clean app bar */}
      <header
        className={`shrink-0 border-b ${
          dark
            ? 'border-white/10 bg-slate-900/95'
            : 'border-slate-200/80 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {onSwitchToChat && (
              <div
                className={`inline-flex rounded-lg border p-0.5 ${
                  dark
                    ? 'border-white/10 bg-slate-950/80'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                    dark
                      ? 'bg-violet-600 text-white'
                      : 'bg-violet-700 text-white'
                  }`}
                >
                  Agent Desk
                </span>
                <button
                  type="button"
                  onClick={onSwitchToChat}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    dark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  Chat
                </button>
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1
                className={`text-base font-semibold tracking-tight ${
                  dark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {deskTab === 'companies'
                  ? 'Company list builder'
                  : deskTab === 'fill'
                    ? 'Fill a job'
                    : 'Goal agent'}
              </h1>
              <p
                className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {deskTab === 'companies'
                  ? 'Background agent finds companies with email or phone'
                  : deskTab === 'fill'
                    ? 'Source real candidates for a careers URL or JD'
                    : 'Multi-step CRM goals with mid-run chat'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex rounded-lg border p-0.5 shadow-sm ${
                dark
                  ? 'border-white/10 bg-slate-950/60'
                  : 'border-slate-200 bg-slate-50/80'
              }`}
            >
              {tabBtn(
                'companies',
                'Companies',
                <Building2 className="h-3.5 w-3.5" />
              )}
              {tabBtn('fill', 'Fill job', <Briefcase className="h-3.5 w-3.5" />)}
              {tabBtn('goal', 'Goal agent', <Bot className="h-3.5 w-3.5" />)}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? 'Switch to light UI' : 'Switch to dark UI'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                dark
                  ? 'border-white/15 bg-slate-950/50 text-amber-200 hover:bg-white/10'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {dark ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
            {deskTab === 'goal' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={outlineBtn}
                  onClick={() => {
                    refreshPast();
                    setHistoryOpen(true);
                  }}
                >
                  <History className="h-3.5 w-3.5 mr-1" />
                  History
                  {pastRuns.length > 0 && (
                    <span
                      className={`ml-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      {pastRuns.length}
                    </span>
                  )}
                </Button>
                {run && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={outlineBtn}
                    onClick={newGoal}
                  >
                    New goal
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Companies list builder ──────────────────────────────── */}
      {deskTab === 'companies' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgentWorkbench
            variant="full"
            defaultMode="companies"
            theme={dark ? 'dark' : 'light'}
            hideChrome
          />
        </div>
      )}

      {/* ── Fill job / source candidates ────────────────────────── */}
      {deskTab === 'fill' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgentWorkbench
            variant="full"
            defaultMode="research"
            theme={dark ? 'dark' : 'light'}
            hideChrome
          />
        </div>
      )}

      {/* ── Goal agent (interactive multi-wave) ─────────────────── */}
      {deskTab === 'goal' && (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        className={`flex min-h-0 min-w-0 flex-1 flex-col border-r ${
          dark ? 'border-white/10 bg-slate-950' : 'border-slate-200 bg-white'
        }`}
      >
        <header
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5 sm:px-6 ${
            dark ? 'border-white/10' : 'border-slate-100'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-medium ${dark ? 'text-slate-100' : 'text-slate-800'}`}
            >
              Multi-step CRM goals
            </p>
            <p
              className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              Interactive chat mid-run · approve writes once · history saved
            </p>
          </div>
          {run && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge(run.status)}`}
            >
              {run.status.replace(/_/g, ' ')}
              {run.wave > 0 ? ` · wave ${run.wave}/${run.maxWaves}` : ''}
              {run.writeApproved ? ' · writes on' : ''}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-4">
          {/* Goal — editable before start; locked during run */}
          <div
            className={`rounded-2xl border p-4 ${
              dark
                ? 'border-white/10 bg-slate-900/80'
                : 'border-slate-200 bg-slate-50/80'
            }`}
          >
            <label
              className={`text-[11px] font-semibold uppercase tracking-wide ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              disabled={busy || (!!run && run.status === 'running')}
              placeholder="What should the agent accomplish? e.g. Search Apollo for X, create companies…"
              className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-70 ${
                dark
                  ? 'border-white/10 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-violet-500/40 focus:ring-violet-500/20'
                  : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-300 focus:ring-violet-100'
              }`}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {!run ||
              ['completed', 'cancelled', 'failed', 'idle'].includes(
                run.status
              ) ? (
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
                  Start run
                </Button>
              ) : (
                <>
                  {canInteract && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendToAgent()}
                      className="bg-slate-900 hover:bg-slate-800"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Continue
                    </Button>
                  )}
                  {!run.writeApproved && canInteract && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendToAgent({ approveWrites: true })}
                      className="bg-emerald-700 hover:bg-emerald-800"
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Approve writes & continue
                    </Button>
                  )}
                  {run.status === 'running' && (
                    <Button type="button" variant="outline" onClick={cancelRun}>
                      <Pause className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>
            {!run && (
              <div className="mt-3 space-y-1">
                {GOAL_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setGoal(ex)}
                    className={`block w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-xs ${
                      dark
                        ? 'text-slate-400 hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-slate-200'
                        : 'text-slate-600 hover:border-violet-100 hover:bg-violet-50'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive conversation thread */}
          {run && run.messages.length > 0 && (
            <div className="space-y-3">
              <h2
                className={`text-xs font-semibold uppercase tracking-wide ${
                  dark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Conversation
              </h2>
              {run.messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}-${m.content.slice(0, 24)}`}
                  className={`flex gap-2 ${
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        dark ? 'bg-violet-500/20' : 'bg-violet-100'
                      }`}
                    >
                      <Bot
                        className={`h-3.5 w-3.5 ${dark ? 'text-violet-300' : 'text-violet-700'}`}
                      />
                    </div>
                  )}
                  <div
                    className={`max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? dark
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-900 text-white'
                        : dark
                          ? 'border border-white/10 bg-slate-900 text-slate-100'
                          : 'border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {m.content.replace(/\n?GOAL_(COMPLETE|CONTINUE)\s*/gi, '')}
                    </p>
                  </div>
                </div>
              ))}
              {busy && (
                <div
                  className={`flex items-center gap-2 text-xs ${
                    dark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Agent working…
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Compact step chips */}
          {run && run.steps.length > 0 && (
            <div
              className={`rounded-xl border p-3 ${
                dark
                  ? 'border-white/10 bg-slate-900/60'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <h2
                className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${
                  dark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Run log
              </h2>
              <ol className="space-y-1.5">
                {run.steps.slice(-8).map((s) => (
                  <li
                    key={s.id}
                    className={`flex gap-2 text-xs ${
                      dark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {s.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" />
                    ) : s.status === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : s.status === 'error' ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    ) : (
                      <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0">
                      <span
                        className={`font-medium ${dark ? 'text-slate-200' : 'text-slate-800'}`}
                      >
                        {s.index}. {s.title}
                      </span>
                      {!!s.toolsUsed?.length && (
                        <span className="ml-1 text-slate-500">
                          ({s.toolsUsed.slice(0, 4).join(', ')})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Mid-run reply — interactive chat with the agent */}
        {showChatComposer && (
          <div
            className={`shrink-0 border-t px-4 py-3 sm:px-6 ${
              dark
                ? 'border-white/10 bg-slate-900/80'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex items-end gap-2 rounded-2xl border px-3 py-2 shadow-sm focus-within:ring-2 ${
                dark
                  ? 'border-white/10 bg-slate-950 focus-within:border-violet-500/40 focus-within:ring-violet-500/20'
                  : 'border-slate-200 bg-slate-50 focus-within:border-violet-300 focus-within:ring-violet-100'
              }`}
            >
              <textarea
                ref={replyRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (reply.trim() && !busy) void sendToAgent({ message: reply });
                  }
                }}
                rows={1}
                disabled={busy || run?.status === 'running'}
                placeholder={
                  run?.status === 'awaiting_approval'
                    ? 'Reply, or click Approve writes…'
                    : 'Reply to the agent (Enter to send)…'
                }
                className={`max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-sm focus:outline-none disabled:opacity-60 ${
                  dark
                    ? 'text-slate-100 placeholder:text-slate-500'
                    : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500"
                disabled={busy || !reply.trim()}
                onClick={() => void sendToAgent({ message: reply })}
                title="Send reply"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p
              className={`mt-1.5 text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}
            >
              Ask questions, change direction, or say “yes” — same run, no restart.
            </p>
          </div>
        )}
      </section>

      {/* ── Right: results rail ───────────────────────────────────── */}
      <aside
        className={`flex min-h-0 w-full shrink-0 flex-col border-t lg:w-[min(100%,400px)] lg:border-l lg:border-t-0 xl:w-[440px] ${
          dark
            ? 'border-white/10 bg-slate-900'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div
          className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${
            dark ? 'border-white/10' : 'border-slate-100'
          }`}
        >
          <div>
            <h2
              className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}
            >
              Results
            </h2>
            <p
              className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              CRM creates + Apollo / search hits from this run
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 text-[11px]">
            {companies.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  dark
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {companies.length} companies
              </span>
            )}
            {apolloHits.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  dark
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-sky-50 text-sky-800'
                }`}
              >
                {apolloHits.length} Apollo
              </span>
            )}
            {people.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  dark
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'bg-violet-50 text-violet-800'
                }`}
              >
                {people.length} people
              </span>
            )}
            {errors.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  dark
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {errors.length} errors
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {!run || run.artifacts.length === 0 ? (
            <div
              className={`rounded-xl border border-dashed px-4 py-12 text-center ${
                dark ? 'border-white/10' : 'border-slate-200'
              }`}
            >
              <Search
                className={`mx-auto h-7 w-7 ${dark ? 'text-slate-600' : 'text-slate-300'}`}
              />
              <p
                className={`mt-2 text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}
              >
                Apollo hits and CRM records appear here as the agent works.
              </p>
              <p
                className={`mt-1 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}
              >
                Tip: mention “search Apollo” or “find companies” in your goal.
              </p>
            </div>
          ) : (
            [...run.artifacts].reverse().map((a) => {
              const Icon = kindIcon(a.kind);
              const body = (
                <div
                  className={`flex gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                    a.kind === 'error'
                      ? dark
                        ? 'border-rose-500/30 bg-rose-500/10'
                        : 'border-rose-100 bg-rose-50/50'
                      : a.kind === 'apollo_hit'
                        ? dark
                          ? 'border-sky-500/25 bg-sky-500/10 hover:bg-sky-500/15'
                          : 'border-sky-100 bg-sky-50/40 hover:bg-sky-50'
                        : dark
                          ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                          : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.kind === 'error'
                        ? 'text-rose-400'
                        : a.kind === 'apollo_hit'
                          ? 'text-sky-400'
                          : 'text-violet-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm font-medium ${
                        dark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {a.title}
                    </div>
                    {a.subtitle && (
                      <div
                        className={`truncate text-[11px] ${
                          dark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {a.subtitle}
                      </div>
                    )}
                    <div
                      className={`mt-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        dark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {a.kind === 'apollo_hit'
                        ? 'Apollo / search'
                        : a.kind.replace(/_/g, ' ')}
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
      </aside>
    </div>
      )}

      {/* History drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className={`absolute inset-0 ${dark ? 'bg-black/50' : 'bg-black/30'}`}
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
          />
          <div
            className={`relative flex h-full w-full max-w-md flex-col shadow-2xl ${
              dark ? 'bg-slate-900 text-slate-100' : 'bg-white'
            }`}
          >
            <div
              className={`flex items-center justify-between border-b px-4 py-3 ${
                dark ? 'border-white/10' : 'border-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <History
                  className={`h-4 w-4 ${dark ? 'text-slate-300' : 'text-slate-700'}`}
                />
                <h2
                  className={`text-sm font-semibold ${
                    dark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Agent run history
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={dark ? 'text-slate-300 hover:bg-white/10' : ''}
                onClick={() => setHistoryOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {pastRuns.length === 0 ? (
                <p
                  className={`px-2 py-8 text-center text-sm ${
                    dark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  No saved runs yet. Start a goal — progress is saved
                  automatically.
                </p>
              ) : (
                pastRuns.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      run?.id === r.id
                        ? dark
                          ? 'border-violet-500/40 bg-violet-500/15'
                          : 'border-violet-300 bg-violet-50'
                        : dark
                          ? 'border-white/10 bg-slate-950/50 hover:border-white/20'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => openPastRun(r)}
                    >
                      <div
                        className={`truncate text-sm font-medium ${
                          dark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {r.goal}
                      </div>
                      <div
                        className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] ${
                          dark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <span
                          className={`rounded-full border px-1.5 py-0.5 capitalize ${statusBadge(r.status)}`}
                        >
                          {r.status.replace(/_/g, ' ')}
                        </span>
                        <span>wave {r.wave}</span>
                        <span>{r.artifacts?.length || 0} results</span>
                        <span>{formatRunWhen(r.updatedAt)}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="mt-1.5 text-[11px] text-rose-500 hover:underline"
                      onClick={() => {
                        if (confirm('Delete this agent run from history?')) {
                          deleteAgentRun(r.id, userId);
                          if (run?.id === r.id) setRun(null);
                          refreshPast();
                        }
                      }}
                    >
                      <Trash2 className="inline h-3 w-3 mr-0.5" />
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
            {pastRuns.length > 0 && (
              <div
                className={`border-t p-3 ${dark ? 'border-white/10' : 'border-slate-100'}`}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`w-full text-rose-500 ${
                    dark ? 'border-white/15 hover:bg-white/5' : ''
                  }`}
                  onClick={() => {
                    if (confirm('Clear all agent run history?')) {
                      clearAgentRuns(userId);
                      setRun(null);
                      refreshPast();
                    }
                  }}
                >
                  Clear all history
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentRunDesk;
