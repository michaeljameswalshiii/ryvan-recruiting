'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  isAgentOpsTab,
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
      { id: 'command', label: 'Command center' },
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
  command: {
    title: 'Mission control',
    note: 'Every active run, exception and approval in one operational view.',
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: AgentOpsTab = isAgentOpsTab(tabParam) ? tabParam : 'command';

  const [summary, setSummary] = useState<AgentOpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'command') params.delete('tab');
    else params.set('tab', next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const heading = HEADING[tab];
  const openHref = useMemo(() => {
    if (tab === 'queue') return undefined;
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
                  ? `${summary.liveCount} agent${summary.liveCount === 1 ? '' : 's'} live`
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

              {tab === 'command' && <CommandCenter summary={summary} onTab={setTab} />}
              {tab === 'fleet' && <FleetPanel bots={summary.bots} />}
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

function FleetPanel({ bots }: { bots: AgentOpsBot[] }) {
  return (
    <div className="ops-fleet-grid">
      {bots.map((bot) => (
        <Link key={bot.id} href={bot.href} className="ops-panel ops-fleet-card">
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
            <span>{bot.hrefLabel}</span>
            <span className="ops-outcome-value">
              {bot.liveCount > 0
                ? `${bot.liveCount} live`
                : bot.state === 'idle'
                  ? 'Idle'
                  : bot.state}
            </span>
          </div>
        </Link>
      ))}
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
