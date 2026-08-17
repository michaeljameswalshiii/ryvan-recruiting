"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Clock3,
  DollarSign,
  GitMerge,
  GitPullRequest,
  Loader2,
  Play,
  RefreshCw,
  ShieldOff,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

type AgentRow = {
  id: string;
  label: string;
  kind: "cron" | "task";
  schedule: string;
  href: string;
  hrefLabel: string;
  summary: string;
  impact: string;
  capabilities: string[];
  tasks: Array<{ id: string; label: string; detail: string }>;
  enabled: boolean;
  state: "off" | "idle" | "queued" | "ready" | "error";
  stateLabel: string;
  updatedAt?: string;
  updatedBy?: string;
  lastRunAt?: string;
  lastDetail?: string;
  lastDurationMs?: number;
  queue: Array<{ label: string; count: number }>;
  cost: {
    spentTodayUsd: number;
    spentMonthUsd: number;
    perRunUsd: number;
    estimateDayIfOnUsd: number;
    estimateMonthIfOnUsd: number;
    note: string;
  };
};

type Totals = {
  spendTodayUsd: number;
  spendMonthUsd: number;
  projectedDayIfEnabledUsd: number;
};

type OpsFixPull = {
  number: number;
  title: string;
  url: string;
  branch: string;
  clusterKey?: string;
};

type OpsFixes = {
  githubConfigured: boolean;
  defaultBranch?: string;
  newCount: number;
  handledCount: number;
  openPrCount: number;
  skippedCount: number;
  mergedCount: number;
  openPulls: OpsFixPull[];
  lastRun?: {
    at: string;
    detail: string;
    opened: number;
    skipped: number;
    failed: number;
    prs: Array<{ number: number; title: string; url: string }>;
  };
};

function timeAgo(iso?: string) {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function usd(n: number) {
  if (!n) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function StateBadge({ state, label }: { state: AgentRow["state"]; label: string }) {
  const cls =
    state === "ready" || state === "idle"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : state === "queued"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : state === "error"
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

export default function AiAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    spendTodayUsd: 0,
    spendMonthUsd: 0,
    projectedDayIfEnabledUsd: 0,
  });
  const [note, setNote] = useState("");
  const [opsFixes, setOpsFixes] = useState<OpsFixes | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-agents", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      if (data.totals) setTotals(data.totals);
      setOpsFixes(data.opsFixes || null);
      setNote(typeof data.note === "string" ? data.note : "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setEnabled(id: string, enabled: boolean) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/ai-agents", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update schedule");
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      toast.success(enabled ? "Schedule enabled" : "Schedule turned off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update schedule");
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(id: string, task?: string) {
    setBusyId(task ? `${id}:${task}` : id);
    try {
      const res = await fetch("/api/admin/ai-agents/run", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(task ? { id, task } : { id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.result?.detail || "Run failed");
      toast.success(data.result?.detail || "Run finished");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusyId(null);
    }
  }

  async function mergePull(prNumber: number) {
    const pull = opsFixes?.openPulls.find((item) => item.number === prNumber);
    const branch = opsFixes?.defaultBranch || "master";
    const ok = window.confirm(
      `Merge #${prNumber}${pull ? ` (${pull.title})` : ""} to ${branch}? Vercel will deploy production.`
    );
    if (!ok) return;
    setBusyId(`merge:${prNumber}`);
    try {
      const res = await fetch("/api/admin/ai-agents/merge", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Merge failed");
      toast.success(data.detail || `Merged #${prNumber} to production`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed");
    } finally {
      setBusyId(null);
    }
  }

  const system = agents.filter((agent) => agent.kind === "task");
  const scheduled = agents.filter((agent) => agent.kind === "cron");
  const enabledCount = scheduled.filter((agent) => agent.enabled).length;

  return (
    <div className="space-y-6 pb-10 text-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Bot className="h-7 w-7 text-orange-600" />
            AI Agents
          </h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            System Admin control plane. System ops fingerprints each error, skips
            clusters it already opened a PR for, and can merge each fix to
            production from this screen. Scheduled agents only process work when
            you turn them on.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Spend today" value={usd(totals.spendTodayUsd)} detail="Actual recruiter-run estimates" />
        <Kpi label="Spend this month" value={usd(totals.spendMonthUsd)} detail="Actual recruiter-run estimates" />
        <Kpi
          label="If busy schedules were on"
          value={usd(totals.projectedDayIfEnabledUsd)}
          detail="Projected today from current queues"
        />
      </div>

      <div
        data-ink-on-light
        className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950"
      >
        <p className="flex items-center gap-2 font-semibold">
          <ShieldOff className="h-4 w-4" />
          {enabledCount === 0
            ? "All background schedules are off"
            : `${enabledCount} background schedule${enabledCount === 1 ? "" : "s"} on`}
        </p>
        <p className="mt-1 text-sm opacity-80">
          {note || "Idle ticks cost $0. Spend only happens when queued work is processed."}
        </p>
      </div>

      {loading && agents.length === 0 ? (
        <div
          data-ink-on-light
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-600"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agents…
        </div>
      ) : (
        <>
          {system.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Wrench className="h-4 w-4" />
                System tasks
              </h2>
              {opsFixes && <FixLedgerStrip fixes={opsFixes} />}
              <div className="grid gap-4">
                {system.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    busyId={busyId}
                    onRun={runNow}
                  />
                ))}
              </div>
              <OpenFixPulls
                fixes={opsFixes}
                busyId={busyId}
                onMerge={mergePull}
              />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Clock3 className="h-4 w-4" />
              Scheduled agents
            </h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {scheduled.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  busyId={busyId}
                  onToggle={setEnabled}
                  onRun={runNow}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div data-ink-on-light className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-2xl font-bold tabular-nums">
        <DollarSign className="h-5 w-5 text-slate-400" />
        {value.replace("$", "")}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function AgentCard({
  agent,
  busyId,
  onToggle,
  onRun,
}: {
  agent: AgentRow;
  busyId: string | null;
  onToggle?: (id: string, enabled: boolean) => void;
  onRun: (id: string, task?: string) => void;
}) {
  const busy = busyId === agent.id || Boolean(busyId?.startsWith(`${agent.id}:`));
  return (
    <section data-ink-on-light className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{agent.label}</h3>
            <StateBadge state={agent.state} label={agent.stateLabel} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            {agent.schedule}
          </p>
        </div>
        {agent.kind === "cron" && onToggle && (
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className={agent.enabled ? "text-emerald-700" : "text-slate-500"}>
              {agent.enabled ? "On" : "Off"}
            </span>
            <input
              type="checkbox"
              className="h-5 w-9 cursor-pointer accent-emerald-600"
              checked={agent.enabled}
              disabled={busy}
              onChange={(event) => onToggle(agent.id, event.target.checked)}
            />
          </label>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-700">{agent.summary}</p>
      <p className="mt-1 text-xs text-slate-500">{agent.impact}</p>

      {agent.capabilities.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {agent.capabilities.map((cap) => (
            <li
              key={cap}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
            >
              {cap}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Last run" value={timeAgo(agent.lastRunAt)} />
        <Stat
          label="Last result"
          value={agent.lastDetail || "—"}
        />
        <Stat label="Spend today" value={usd(agent.cost.spentTodayUsd)} />
        <Stat
          label={agent.enabled ? "Est. today if busy" : "Est. if turned on"}
          value={usd(agent.cost.estimateDayIfOnUsd)}
        />
      </dl>
      <p className="mt-2 text-[11px] text-slate-500">{agent.cost.note}</p>

      {agent.queue.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {agent.queue.map((item) => (
            <span
              key={item.label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
            >
              <span className="text-slate-500">{item.label}</span>{" "}
              <span className="font-semibold tabular-nums">{item.count}</span>
            </span>
          ))}
        </div>
      )}

      {agent.updatedBy && (
        <p className="mt-2 text-[11px] text-slate-500">
          Schedule last changed by {agent.updatedBy}
          {agent.updatedAt ? ` · ${timeAgo(agent.updatedAt)}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {agent.kind === "cron" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRun(agent.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busyId === agent.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run once
          </button>
        )}
        {agent.tasks.map((task) => {
          const primary = task.id === "fix-errors";
          return (
            <button
              key={task.id}
              type="button"
              title={task.detail}
              disabled={busy}
              onClick={() => onRun(agent.id, task.id)}
              className={
                primary
                  ? "inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  : "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
              }
            >
              {busyId === `${agent.id}:${task.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : primary ? (
                <GitPullRequest className="h-3.5 w-3.5" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
              {task.label}
            </button>
          );
        })}
        <Link
          href={agent.href}
          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold hover:bg-slate-50"
        >
          {agent.hrefLabel}
        </Link>
      </div>
    </section>
  );
}

function FixLedgerStrip({ fixes }: { fixes: OpsFixes }) {
  return (
    <div
      data-ink-on-light
      className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm"
    >
      <p className="font-semibold text-slate-900">Handled vs new</p>
      <p className="mt-1 text-xs text-slate-500">
        Each error is fingerprinted (name + route + normalized message). Cleaning
        Ops Health logs does not erase this ledger. An open PR keeps the cluster
        handled; after you merge, a return of the same error is treated as new.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1">
          New <span className="font-semibold tabular-nums">{fixes.newCount}</span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
          Already handled{" "}
          <span className="font-semibold tabular-nums">{fixes.handledCount}</span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
          Open PRs{" "}
          <span className="font-semibold tabular-nums">{fixes.openPrCount}</span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
          Merged{" "}
          <span className="font-semibold tabular-nums">{fixes.mergedCount}</span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
          Config / infra skipped{" "}
          <span className="font-semibold tabular-nums">{fixes.skippedCount}</span>
        </span>
      </div>
      {!fixes.githubConfigured && (
        <p className="mt-2 text-xs text-amber-800">
          Add <code className="font-mono">GITHUB_OPS_TOKEN</code> on Vercel
          (contents + pull requests write) so System ops can open and merge PRs.
        </p>
      )}
      {fixes.lastRun?.detail && (
        <p className="mt-2 text-xs text-slate-500">
          Last fix run {timeAgo(fixes.lastRun.at)} · {fixes.lastRun.detail}
        </p>
      )}
    </div>
  );
}

function OpenFixPulls({
  fixes,
  busyId,
  onMerge,
}: {
  fixes: OpsFixes | null;
  busyId: string | null;
  onMerge: (prNumber: number) => void;
}) {
  const pulls = fixes?.openPulls || [];
  if (!fixes || pulls.length === 0) return null;
  return (
    <div
      data-ink-on-light
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GitPullRequest className="h-4 w-4" />
        Open fix PRs — merge each to production
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Merge squash-commits onto {fixes.defaultBranch || "master"}. Vercel then
        deploys that branch to production.
      </p>
      <ul className="mt-3 space-y-2">
        {pulls.map((pull) => {
          const merging = busyId === `merge:${pull.number}`;
          return (
            <li
              key={pull.number}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <a
                  href={pull.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  #{pull.number} {pull.title}
                </a>
                <p className="truncate text-[11px] text-slate-500">{pull.branch}</p>
              </div>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => onMerge(pull.number)}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {merging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitMerge className="h-3.5 w-3.5" />
                )}
                Merge to production
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
