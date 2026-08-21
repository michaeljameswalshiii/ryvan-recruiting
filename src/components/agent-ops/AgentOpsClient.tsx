'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Building2,
  Loader2,
  MailCheck,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  isAgentOpsTab,
  type AgentOpsActiveRun,
  type AgentOpsBot,
  type AgentOpsBotState,
  type AgentOpsSummary,
  type AgentOpsTab,
} from '@/lib/agent-ops/types';

const NAV: Array<{
  group: string;
  items: Array<{ id: AgentOpsTab; label: string }>;
}> = [
  {
    group: 'Operate',
    items: [
      { id: 'active', label: 'Live runs' },
      { id: 'command', label: 'Command center' },
      { id: 'launch', label: 'Run agents' },
      { id: 'fleet', label: 'Agent fleet' },
      { id: 'queue', label: 'Interventions' },
    ],
  },
  {
    group: 'Today',
    items: [{ id: 'brief', label: 'Daily brief' }],
  },
  {
    group: 'Review',
    items: [{ id: 'history', label: 'Run history' }],
  },
];

const HEADING: Record<AgentOpsTab, { title: string; note: string }> = {
  active: {
    title: 'Live runs',
    note: 'Every queued or running agent job, shown individually.',
  },
  command: {
    title: 'Mission control',
    note: 'Every active run, exception and approval in one operational view.',
  },
  launch: {
    title: 'Run an agent',
    note: 'Start recurring Trio workflows without leaving Agent Operations.',
  },
  fleet: {
    title: 'Agent fleet',
    note: 'Fill Req, List Builder, and Outreach — the three workers this board runs.',
  },
  queue: {
    title: 'Interventions',
    note: 'Work that cannot continue until a recruiter decides.',
  },
  brief: {
    title: 'Daily brief',
    note: 'What agents finished, and the few calls that still need you.',
  },
  history: {
    title: 'Run history',
    note: 'Recent agent activity across sourcing, company lists, and sequences.',
  },
};

function stateClass(state: AgentOpsBotState): string {
  if (state === 'running' || state === 'queued') return 'is-live';
  if (state === 'paused') return 'is-wait';
  if (state === 'failed') return 'is-fail';
  return '';
}

function progressClass(state: AgentOpsBotState): string {
  if (state === 'paused') return 'is-wait';
  if (state === 'failed') return 'is-fail';
  return '';
}

function botName(id: AgentOpsSummary['bots'][number]['id']): string {
  if (id === 'fill-req') return 'Fill Req';
  if (id === 'list-builder') return 'List Builder';
  return 'Outreach';
}

export function AgentOpsClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const urlTab: AgentOpsTab = isAgentOpsTab(tabParam) ? tabParam : 'active';
  const [tab, setSelectedTab] = useState<AgentOpsTab>(urlTab);

  const [summary, setSummary] = useState<AgentOpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTab(urlTab);
  }, [urlTab]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/agent-ops/summary', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setSummary(data.summary as AgentOpsSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agent ops');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const live = (summary?.liveCount || 0) > 0;
  useEffect(() => {
    const ms = live ? 8_000 : 20_000;
    const t = window.setInterval(() => void load(true), ms);
    return () => window.clearInterval(t);
  }, [live, load]);

  const setTab = (next: AgentOpsTab) => {
    setSelectedTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'active') params.delete('tab');
    else params.set('tab', next);
    const q = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      q ? `${pathname}?${q}` : pathname
    );
  };

  const heading = HEADING[tab];
  const openHref = useMemo(() => {
    if (tab === 'active' || tab === 'queue' || tab === 'launch') return undefined;
    if (tab === 'brief' || tab === 'command') {
      const first = summary?.interventions[0]?.href;
      if (first) return first;
    }
    if (tab === 'fleet') return summary?.bots[0]?.href;
    return '/dashboard/general-ai-usage';
  }, [tab, summary]);

  return (
    <div className="agent-ops">
      {loading && !summary ? (
        <div className="ops-skel" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agent operations…
        </div>
      ) : error && !summary ? (
        <div className="ops-error">
          <strong>Could not load Agent Ops.</strong>
          <p className="ops-meta" style={{ marginTop: 6 }}>
            {error}
          </p>
          <button
            type="button"
            className="ops-choice"
            style={{ marginTop: 12 }}
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : summary ? (
        <section className="ops-window">
          <div className="ops-topbar">
            <div className="ops-brand">
              <span className="ops-brand-mark">T</span>
              Trio Agent Operations
            </div>
            <div className="ops-top-actions">
              <span className="ops-live">
                <span
                  className={`ops-live-dot${summary.liveCount ? '' : ' is-idle'}`}
                />
                {summary.liveCount > 0
                  ? `${summary.liveCount} active run${summary.liveCount === 1 ? '' : 's'}`
                  : 'All idle'}
              </span>
              <span>{summary.greetingName}</span>
              <button
                type="button"
                className="ops-icon-btn"
                onClick={() => void load()}
                disabled={refreshing}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5${refreshing ? ' animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          <div className="ops-shell">
            <nav className="ops-sidebar" aria-label="Agent Ops">
              {NAV.map((group) => (
                <div key={group.group}>
                  <div className="ops-nav-label">{group.group}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`ops-nav-item${tab === item.id ? ' is-active' : ''}`}
                      aria-current={tab === item.id ? 'page' : undefined}
                      onClick={() => setTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <main className="ops-main">
              <div className="ops-heading">
                <div>
                  <h2>
                    {tab === 'brief' ? summary.brief.headline : heading.title}
                  </h2>
                  <p>
                    {tab === 'brief'
                      ? `${summary.stats.completedValue} completed · ${summary.stats.attentionValue} need you`
                      : heading.note}
                  </p>
                </div>
                {openHref ? (
                  <Link href={openHref} className="ops-choice">
                    {tab === 'brief'
                      ? 'Open first decision'
                      : tab === 'fleet'
                        ? 'Open AI desk'
                        : 'Open workspace'}
                  </Link>
                ) : null}
              </div>

              {error ? (
                <div className="ops-error" style={{ marginBottom: 12 }}>
                  {error}
                </div>
              ) : null}

              {tab === 'active' && (
                <ActiveRunsPanel runs={summary.activeRuns} onLaunch={() => setTab('launch')} />
              )}
              {tab === 'command' && <CommandCenter summary={summary} onTab={setTab} />}
              {tab === 'launch' && (
                <LaunchPanel
                  onStarted={() => void load(true)}
                  onOpenHistory={() => setTab('history')}
                />
              )}
              {tab === 'fleet' && (
                <FleetPanel bots={summary.bots} onLaunch={() => setTab('launch')} />
              )}
              {tab === 'queue' && <QueuePanel summary={summary} />}
              {tab === 'brief' && <BriefPanel summary={summary} />}
              {tab === 'history' && <HistoryPanel summary={summary} />}
            </main>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ActiveRunsPanel({
  runs,
  onLaunch,
}: {
  runs: AgentOpsActiveRun[];
  onLaunch: () => void;
}) {
  if (runs.length === 0) {
    return (
      <section className="ops-panel ops-live-empty">
        <span className="ops-live-empty-icon"><Play /></span>
        <h3>No agents are queued or running</h3>
        <p>Start a Fill Req or List Builder and it will appear here as its own run.</p>
        <button type="button" className="ops-choice" onClick={onLaunch}>
          Run an agent
        </button>
      </section>
    );
  }

  const runningCount = runs.filter((run) => run.status === 'running').length;
  const queuedCount = runs.filter((run) => run.status === 'queued').length;

  return (
    <section className="ops-panel ops-active-panel">
      <div className="ops-panel-head">
        <span className="ops-panel-title">
          {runs.length} active run{runs.length === 1 ? '' : 's'}
        </span>
        <span className="ops-meta ops-active-totals">
          {runningCount} running · {queuedCount} queued
        </span>
      </div>
      <div className="ops-active-list">
        {runs.map((run) => (
          <ActiveRunRow key={run.id} run={run} />
        ))}
      </div>
    </section>
  );
}

function ActiveRunRow({ run }: { run: AgentOpsActiveRun }) {
  const updated = new Date(run.updatedAt);
  const updatedLabel = Number.isNaN(updated.getTime())
    ? 'Recently updated'
    : `Updated ${updated.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })}`;

  return (
    <Link href={run.href} className="ops-active-run">
      <div className="ops-active-run-agent">
        <span className={`ops-live-pulse${run.status === 'queued' ? ' is-queued' : ''}`} />
        <div>
          <strong>{run.agentName}</strong>
          <span>{updatedLabel}</span>
        </div>
      </div>
      <div className="ops-active-run-work">
        <strong>{run.title}</strong>
        <span>{run.detail}</span>
        {run.progressPct != null ? (
          <div className="ops-active-progress-row">
            <div className="ops-progress">
              <span style={{ width: `${run.progressPct}%` }} />
            </div>
            <span>{run.progressLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="ops-active-run-tail">
        <span className={`ops-status is-live ops-active-run-status is-${run.status}`}>
          {run.status}
        </span>
        <span className="ops-result-link">{run.hrefLabel || 'Open run'} â†’</span>
      </div>
    </Link>
  );
}

function CommandCenter({
  summary,
  onTab,
}: {
  summary: AgentOpsSummary;
  onTab: (tab: AgentOpsTab) => void;
}) {
  return (
    <>
      <div className="ops-stats">
        <div className="ops-stat">
          <div className="ops-stat-label">Work completed</div>
          <div className="ops-stat-value">{summary.stats.completedValue}</div>
          <div className="ops-stat-context">{summary.stats.completedContext}</div>
        </div>
        <div className="ops-stat">
          <div className="ops-stat-label">Human time saved</div>
          <div className="ops-stat-value">{summary.stats.savedValue}</div>
          <div className="ops-stat-context">{summary.stats.savedContext}</div>
        </div>
        <button
          type="button"
          className="ops-stat"
          onClick={() => onTab('queue')}
          style={{ textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="ops-stat-label">Needs attention</div>
          <div className="ops-stat-value">{summary.stats.attentionValue}</div>
          <div className="ops-stat-context">{summary.stats.attentionContext}</div>
        </button>
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <span className="ops-panel-title">Live agent fleet</span>
            <button
              type="button"
              className="ops-meta"
              onClick={() => onTab('fleet')}
              style={{ background: 'none', border: 0, cursor: 'pointer' }}
            >
              All bots
            </button>
          </div>
          {summary.bots.map((bot) => (
            <BotRow key={bot.id} bot={bot} />
          ))}
        </section>

        <aside className="ops-panel">
          <div className="ops-panel-head">
            <span className="ops-panel-title">Intervention queue</span>
            <span className="ops-priority">
              {summary.interventions.length} open
            </span>
          </div>
          {summary.interventions.length === 0 ? (
            <div className="ops-empty">No interventions. Agents are not blocked.</div>
          ) : (
            summary.interventions.slice(0, 6).map((item) => (
              <Link key={item.id} href={item.href} className="ops-queue-item">
                <div className="ops-queue-top">
                  <strong>{item.title}</strong>
                  <span>{item.ageLabel}</span>
                </div>
                <div className="ops-meta">
                  {botName(item.botId)} · {item.detail}
                </div>
              </Link>
            ))
          )}
        </aside>
      </div>
    </>
  );
}

function FleetPanel({
  bots,
  onLaunch,
}: {
  bots: AgentOpsBot[];
  onLaunch: (botId: AgentOpsBot['id']) => void;
}) {
  return (
    <div className="ops-fleet-grid">
      {bots.map((bot) => (
        <article key={bot.id} className="ops-panel ops-fleet-card">
          <div className="ops-fleet-top">
            <div className="ops-agent-name">
              <span className="ops-avatar">{bot.initials}</span>
              {bot.name}
            </div>
            <span className={`ops-status ${stateClass(bot.state)}`}>{bot.state}</span>
          </div>
          <p className="ops-meta" style={{ marginTop: 10 }}>
            {bot.headline}
          </p>
          {bot.progressPct != null ? (
            <div className="ops-progress" style={{ marginTop: 12 }}>
              <span
                className={progressClass(bot.state)}
                style={{ width: `${bot.progressPct}%` }}
              />
            </div>
          ) : null}
          <div className="ops-outcome-foot">
            <Link href={bot.href}>{bot.hrefLabel}</Link>
            <span className="ops-outcome-value">
              {bot.liveCount > 0
                ? `${bot.liveCount} live`
                : bot.state === 'idle'
                  ? 'Idle'
                  : bot.state}
            </span>
          </div>
          <button
            type="button"
            className="ops-run-secondary"
            onClick={() => onLaunch(bot.id)}
          >
            <Play className="h-3.5 w-3.5" />
            Run this agent
          </button>
        </article>
      ))}
    </div>
  );
}

type OpenJob = {
  id?: string;
  title?: string;
  companyName?: string;
  description?: string;
  location?: string;
};

type LaunchKind = 'fill' | 'list' | 'outreach';

function LaunchPanel({
  onStarted,
  onOpenHistory,
}: {
  onStarted: () => void;
  onOpenHistory: () => void;
}) {
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [fillBrief, setFillBrief] = useState('');
  const [fillTarget, setFillTarget] = useState(25);
  const [fillRadius, setFillRadius] = useState('25');
  const [listBrief, setListBrief] = useState('');
  const [listGeography, setListGeography] = useState('United States');
  const [listTarget, setListTarget] = useState(50);
  const [sharing, setSharing] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState<LaunchKind | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
    href?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/jobs?openOnly=true', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  const showError = (message: string) => {
    setNotice({ tone: 'error', text: message });
  };

  const startFill = async () => {
    const jobBrief = selectedJob
      ? [
          selectedJob.title,
          selectedJob.companyName ? `Company: ${selectedJob.companyName}` : '',
          selectedJob.location ? `Location: ${selectedJob.location}` : '',
          selectedJob.description || '',
        ]
          .filter(Boolean)
          .join('\n')
      : fillBrief.trim();
    if (!jobBrief) {
      showError('Choose an open job or paste a role brief first.');
      return;
    }
    setBusy('fill');
    setNotice(null);
    try {
      const res = await fetch('/api/agent/recruiter-runs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: jobBrief,
          jobId: selectedJob?.id,
          location: selectedJob?.location,
          targetQualified: fillTarget,
          locationRadius: fillRadius,
          progressiveWidening: fillRadius !== 'anywhere',
          visibility: sharing,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.run?.id) {
        throw new Error(data.error || 'Could not start Fill Req.');
      }
      setNotice({
        tone: 'success',
        text: 'Fill Req is queued and will begin within about a minute. You can leave this page safely.',
        href: '/dashboard/general-ai-usage',
      });
      setFillBrief('');
      onStarted();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not start Fill Req.');
    } finally {
      setBusy(null);
    }
  };

  const startList = async () => {
    if (!listBrief.trim()) {
      showError('Describe the companies you want the List Builder to find.');
      return;
    }
    setBusy('list');
    setNotice(null);
    try {
      const res = await fetch('/api/list-builder', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: listBrief.trim(),
          geography: listGeography.trim() || 'United States',
          targetSize: listTarget,
          visibility: sharing,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.job?.id) {
        throw new Error(data.error || 'Could not start List Builder.');
      }
      setNotice({
        tone: 'success',
        text: 'List Builder is running. Its first research batch has started.',
        href: `/dashboard/list-builder/${encodeURIComponent(String(data.job.id))}`,
      });
      setListBrief('');
      onStarted();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not start List Builder.');
    } finally {
      setBusy(null);
    }
  };

  const runOutreach = async () => {
    setBusy('outreach');
    setNotice(null);
    try {
      const res = await fetch('/api/sequences/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not run due outreach.');
      const processed = Number(data.processed) || 0;
      const sent = Number(data.sent) || 0;
      const failed = Number(data.failed) || 0;
      setNotice({
        tone: failed > 0 ? 'error' : 'success',
        text:
          processed === 0
            ? 'No outreach steps are due right now.'
            : `Processed ${processed} due step${processed === 1 ? '' : 's'}: ${sent} completed${failed ? `, ${failed} failed` : ''}.`,
        href: '/dashboard/sequences',
      });
      onStarted();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not run due outreach.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ops-launch-stack">
      <section className="ops-launch-toolbar">
        <div>
          <strong>Default visibility</strong>
          <div className="ops-meta">Choose who can see the resulting run.</div>
        </div>
        <div className="ops-segment" role="group" aria-label="Run visibility">
          {(['private', 'public'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={sharing === value ? 'is-active' : ''}
              onClick={() => setSharing(value)}
            >
              {value === 'private' ? 'Only me' : 'My team'}
            </button>
          ))}
        </div>
      </section>

      {notice ? (
        <div className={`ops-launch-notice is-${notice.tone}`} role="status">
          <span>{notice.text}</span>
          <span className="ops-launch-notice-actions">
            {notice.href ? <Link href={notice.href}>Open run</Link> : null}
            <button type="button" onClick={onOpenHistory}>Run history</button>
          </span>
        </div>
      ) : null}

      <div className="ops-launch-grid">
        <section className="ops-panel ops-launch-card">
          <div className="ops-launch-card-head">
            <span className="ops-launch-icon"><Search /></span>
            <div>
              <h3>Fill Req</h3>
              <p>Bedrock plans the search; Apollo finds and ranks real candidates.</p>
            </div>
          </div>
          <label className="ops-field">
            <span>Open job</span>
            <select
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              disabled={jobsLoading}
            >
              <option value="">{jobsLoading ? 'Loading jobs…' : 'Use a pasted brief instead'}</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {[job.title, job.companyName].filter(Boolean).join(' — ')}
                </option>
              ))}
            </select>
          </label>
          {!selectedJobId ? (
            <label className="ops-field">
              <span>Role brief or careers URL</span>
              <textarea
                rows={4}
                value={fillBrief}
                onChange={(event) => setFillBrief(event.target.value)}
                placeholder="Plant Manager in Fort Myers with CNC experience…"
              />
            </label>
          ) : (
            <div className="ops-selected-job">
              <strong>{selectedJob?.title}</strong>
              <span>{[selectedJob?.companyName, selectedJob?.location].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          <div className="ops-inline-fields">
            <label className="ops-field">
              <span>Qualified candidates</span>
              <input
                type="number"
                min={1}
                max={100}
                value={fillTarget}
                onChange={(event) => setFillTarget(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="ops-field">
              <span>Search radius</span>
              <select value={fillRadius} onChange={(event) => setFillRadius(event.target.value)}>
                <option value="10">10 miles</option>
                <option value="25">25 miles</option>
                <option value="50">50 miles</option>
                <option value="100">100 miles</option>
                <option value="statewide">Statewide</option>
                <option value="nationwide">Nationwide</option>
                <option value="anywhere">Anywhere</option>
              </select>
            </label>
          </div>
          <div className="ops-launch-foot">
            <span>Worker checks every minute</span>
            <button type="button" className="ops-choice" onClick={() => void startFill()} disabled={busy !== null}>
              {busy === 'fill' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Fill Req
            </button>
          </div>
        </section>

        <section className="ops-panel ops-launch-card">
          <div className="ops-launch-card-head">
            <span className="ops-launch-icon"><Building2 /></span>
            <div>
              <h3>List Builder</h3>
              <p>Research a targeted company list with usable contact details.</p>
            </div>
          </div>
          <label className="ops-field">
            <span>Companies to find</span>
            <textarea
              rows={4}
              value={listBrief}
              onChange={(event) => setListBrief(event.target.value)}
              placeholder="Precision manufacturers with 50–500 employees and active hiring…"
            />
          </label>
          <div className="ops-inline-fields">
            <label className="ops-field">
              <span>Geography</span>
              <input value={listGeography} onChange={(event) => setListGeography(event.target.value)} />
            </label>
            <label className="ops-field">
              <span>Target companies</span>
              <input
                type="number"
                min={1}
                max={100}
                value={listTarget}
                onChange={(event) => setListTarget(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
          </div>
          <div className="ops-launch-foot">
            <span>First batch now · then every 5 minutes</span>
            <button type="button" className="ops-choice" onClick={() => void startList()} disabled={busy !== null}>
              {busy === 'list' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run List Builder
            </button>
          </div>
        </section>

        <section className="ops-panel ops-launch-card ops-launch-card-wide">
          <div className="ops-launch-card-head">
            <span className="ops-launch-icon"><MailCheck /></span>
            <div>
              <h3>Outreach</h3>
              <p>Process sequence steps that are due now. Future steps continue on the hourly schedule.</p>
            </div>
          </div>
          <div className="ops-launch-foot">
            <span>Only due steps run; normal email and task safeguards still apply</span>
            <div className="ops-launch-actions">
              <Link href="/dashboard/sequences" className="ops-run-secondary">Manage sequences</Link>
              <button type="button" className="ops-choice" onClick={() => void runOutreach()} disabled={busy !== null}>
                {busy === 'outreach' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run due steps now
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function QueuePanel({ summary }: { summary: AgentOpsSummary }) {
  if (summary.interventions.length === 0) {
    return (
      <section className="ops-panel">
        <div className="ops-empty">
          Nothing needs a recruiter. When a list is ready to import, a fill req
          fails, or a sequence step is due, it shows up here.
        </div>
      </section>
    );
  }

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <span className="ops-panel-title">Open interventions</span>
        <span className="ops-priority">{summary.interventions.length} open</span>
      </div>
      {summary.interventions.map((item) => (
        <Link key={item.id} href={item.href} className="ops-queue-item">
          <div className="ops-queue-top">
            <strong className={item.priority === 'high' ? 'ops-risk' : undefined}>
              {item.title}
            </strong>
            <span>{item.ageLabel}</span>
          </div>
          <div className="ops-meta">
            {botName(item.botId)} · {item.detail}
          </div>
        </Link>
      ))}
    </section>
  );
}

function BriefPanel({ summary }: { summary: AgentOpsSummary }) {
  return (
    <>
      <div className="ops-stats">
        <div className="ops-stat">
          <div className="ops-stat-label">Work completed</div>
          <div className="ops-stat-value">{summary.stats.completedValue}</div>
          <div className="ops-stat-context">{summary.stats.completedContext}</div>
        </div>
        <div className="ops-stat">
          <div className="ops-stat-label">Human time saved</div>
          <div className="ops-stat-value">{summary.stats.savedValue}</div>
          <div className="ops-stat-context">{summary.stats.savedContext}</div>
        </div>
        <div className="ops-stat">
          <div className="ops-stat-label">Needs attention</div>
          <div className="ops-stat-value">{summary.stats.attentionValue}</div>
          <div className="ops-stat-context">{summary.stats.attentionContext}</div>
        </div>
      </div>

      <div className="ops-brief-grid">
        <div>
          <section className="ops-panel ops-brief-hero">
            <h3>Today’s recruiting brief</h3>
            <p>{summary.brief.body}</p>
          </section>
          <section className="ops-panel" style={{ marginTop: 12 }}>
            <div className="ops-panel-head">
              <span className="ops-panel-title">Impact this week</span>
              <span>Last 7 days</span>
            </div>
            {summary.brief.impact.map((row) => (
              <div key={row.label} className="ops-impact-row">
                <span>{row.label}</span>
                <span>{row.detail}</span>
                <span className="ops-impact-value">{row.value}</span>
              </div>
            ))}
          </section>
        </div>
        <aside className="ops-panel">
          <div className="ops-panel-head">
            <span className="ops-panel-title">Decision agenda</span>
            <span>{summary.brief.agenda.length} items</span>
          </div>
          {summary.brief.agenda.map((item, index) => {
            const inner = (
              <>
                <span className="ops-time">{item.when}</span>
                <div>
                  <strong className={item.tone === 'risk' ? 'ops-risk' : undefined}>
                    {item.title}
                  </strong>
                  <div className="ops-meta">{item.detail}</div>
                </div>
              </>
            );
            return item.href ? (
              <Link key={`${item.title}-${index}`} href={item.href} className="ops-timeline-item">
                {inner}
              </Link>
            ) : (
              <div key={`${item.title}-${index}`} className="ops-timeline-item">
                {inner}
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}

function HistoryPanel({ summary }: { summary: AgentOpsSummary }) {
  if (summary.history.length === 0) {
    return (
      <section className="ops-panel">
        <div className="ops-empty">
          No agent history yet. Runs from Fill Req, List Builder, and Outreach
          will appear here.
        </div>
      </section>
    );
  }

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <span className="ops-panel-title">Recent agent work</span>
        <span className="ops-meta">Newest first</span>
      </div>
      {summary.history.map((item) => {
        const inner = (
          <>
            <span className="ops-time">
              {new Date(item.at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            <div>
              <strong>{item.title}</strong>
              <div className="ops-meta">
                {botName(item.botId)} · {item.detail}
              </div>
            </div>
            {item.href ? (
              <span className="ops-result-link">{item.hrefLabel || 'Open run'} â†’</span>
            ) : null}
          </>
        );
        return item.href ? (
          <Link key={item.id} href={item.href} className="ops-timeline-item">
            {inner}
          </Link>
        ) : (
          <div key={item.id} className="ops-timeline-item">
            {inner}
          </div>
        );
      })}
    </section>
  );
}

function BotRow({ bot }: { bot: AgentOpsBot }) {
  return (
    <Link href={bot.href} className="ops-agent-row">
      <div className="ops-agent-name">
        <span className="ops-avatar">{bot.initials}</span>
        {bot.name}
      </div>
      <div>
        <span>{bot.headline}</span>
        {bot.progressPct != null ? (
          <div className="ops-progress">
            <span
              className={progressClass(bot.state)}
              style={{ width: `${bot.progressPct}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className={`ops-status ${stateClass(bot.state)}`}>{bot.state}</div>
    </Link>
  );
}

export default AgentOpsClient;
