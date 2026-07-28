'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Plus,
  RefreshCw,
  Loader2,
  Link2,
  Users,
  ListOrdered,
  BarChart3,
  Building2,
  Clock,
  Copy,
  Check,
  Video,
  AlertTriangle,
  Calendar,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type Tab =
  | 'overview'
  | 'interviews'
  | 'links'
  | 'pools'
  | 'plans'
  | 'calendars'
  | 'portals'
  | 'analytics';

type Interview = {
  id: string;
  title: string;
  status: string;
  mode: string;
  startAt: string;
  endAt: string;
  candidateName?: string;
  candidateId: string;
  jobTitle?: string;
  conferenceUrl?: string;
  recoveryLinkToken?: string;
  stageWritten?: string;
  rescheduleCount?: number;
};

type ScheduleLink = {
  id: string;
  token: string;
  candidateName?: string;
  candidateId: string;
  jobTitle?: string;
  interviewTypeName: string;
  expiresAt: string;
  usedAt?: string;
  durationMinutes: number;
};

type Pool = {
  id: string;
  name: string;
  strategy: string;
  members: { email: string; name: string; role: string; active?: boolean }[];
  description?: string;
};

type Plan = {
  id: string;
  name: string;
  jobTitle?: string;
  steps: {
    id: string;
    name: string;
    durationMinutes: number;
    stageOnBook: string;
  }[];
};

type CalendarConn = {
  id: string;
  email: string;
  name?: string;
  provider: string;
  connected: boolean;
  timezone: string;
  bufferMinutes: number;
  maxInterviewsPerDay: number;
};

type Portal = {
  id: string;
  token: string;
  clientName: string;
  contactEmail: string;
  contactName?: string;
  expiresAt?: string;
  availability?: { start: string; end: string }[];
};

type Analytics = {
  totalInterviews: number;
  scheduled: number;
  completed: number;
  noShows: number;
  cancelled: number;
  noShowRate: number;
  selfServeRate: number;
  avgRescheduleCount: number;
  openLinks: number;
  upcoming7d: number;
  byStatus: Record<string, number>;
  byMode: Record<string, number>;
  interviewerLoad: { email: string; name?: string; count: number }[];
};

const TABS: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: 'overview', label: 'Overview', icon: CalendarClock },
  { id: 'interviews', label: 'Interviews', icon: Video },
  { id: 'links', label: 'Self-schedule', icon: Link2 },
  { id: 'pools', label: 'Pools', icon: Users },
  { id: 'plans', label: 'Interview plans', icon: ListOrdered },
  { id: 'calendars', label: 'Calendars', icon: Calendar },
  { id: 'portals', label: 'Client portal', icon: Building2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

function statusColor(status: string) {
  switch (status) {
    case 'confirmed':
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'no_show':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'pending_panel':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Copied');
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      Copy
    </button>
  );
}

export default function SchedulingPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [links, setLinks] = useState<ScheduleLink[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [calendars, setCalendars] = useState<CalendarConn[]>([]);
  const [portals, setPortals] = useState<Portal[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // Create link dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkForm, setLinkForm] = useState({
    candidateId: '',
    candidateName: '',
    candidateEmail: '',
    jobTitle: '',
    interviewTypeName: 'Recruiter screen',
    durationMinutes: 30,
    planId: '',
    poolId: '',
    stageOnBook: 'interviewing',
  });
  const [lastLinkUrl, setLastLinkUrl] = useState<string | null>(null);

  // Admin book dialog
  const [bookOpen, setBookOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookForm, setBookForm] = useState({
    candidateId: '',
    candidateName: '',
    jobTitle: '',
    startAt: '',
    durationMinutes: 30,
    title: 'Interview',
  });

  // Pool dialog
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolForm, setPoolForm] = useState({
    name: '',
    strategy: 'round_robin',
    membersText: '',
  });

  // Plan dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: 'Standard interview plan',
    description: '',
    jobTitle: '',
  });

  // Calendar form
  const [calForm, setCalForm] = useState({
    email: '',
    name: '',
    provider: 'manual',
    connected: true,
    timezone: 'America/New_York',
    bufferMinutes: 10,
    maxInterviewsPerDay: 6,
  });
  const [savingCal, setSavingCal] = useState(false);

  // Portal dialog
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalForm, setPortalForm] = useState({
    clientName: '',
    contactEmail: '',
    contactName: '',
  });
  const [lastPortalUrl, setLastPortalUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scheduling');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setInterviews(data.interviews || []);
      setLinks(data.links || []);
      setPools(data.pools || []);
      setPlans(data.plans || []);
      setCalendars(data.calendars || []);
      setPortals(data.portals || []);
      setAnalytics(data.analytics || null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load scheduling');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upcoming = useMemo(
    () =>
      interviews
        .filter(
          (iv) =>
            new Date(iv.startAt).getTime() >= Date.now() &&
            !['cancelled', 'no_show', 'completed'].includes(iv.status)
        )
        .sort(
          (a, b) =>
            new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
        .slice(0, 8),
    [interviews]
  );

  const createLink = async () => {
    if (!linkForm.candidateId.trim()) {
      toast.error('Candidate ID is required');
      return;
    }
    setCreatingLink(true);
    try {
      const res = await fetch('/api/scheduling/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...linkForm,
          durationMinutes: Number(linkForm.durationMinutes),
          planId: linkForm.planId || undefined,
          poolId: linkForm.poolId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLastLinkUrl(data.url);
      toast.success('Self-schedule link created');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setCreatingLink(false);
    }
  };

  const adminBook = async () => {
    if (!bookForm.candidateId || !bookForm.startAt) {
      toast.error('Candidate ID and start time required');
      return;
    }
    setBooking(true);
    try {
      const res = await fetch('/api/scheduling/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: bookForm.candidateId,
          candidateName: bookForm.candidateName || undefined,
          jobTitle: bookForm.jobTitle || undefined,
          startAt: new Date(bookForm.startAt).toISOString(),
          durationMinutes: Number(bookForm.durationMinutes),
          title: bookForm.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Interview booked · stage writeback applied');
      setBookOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Book failed');
    } finally {
      setBooking(false);
    }
  };

  const createPool = async () => {
    if (!poolForm.name.trim()) {
      toast.error('Name required');
      return;
    }
    const members = poolForm.membersText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email] = line.includes('<')
          ? [
              line.split('<')[0].trim(),
              line.split('<')[1]?.replace('>', '').trim(),
            ]
          : line.includes(',')
            ? line.split(',').map((s) => s.trim())
            : [line.split('@')[0], line];
        return {
          name: name || email || 'Member',
          email: email || name,
          role: 'panelist' as const,
          active: true,
        };
      })
      .filter((m) => m.email?.includes('@'));

    try {
      const res = await fetch('/api/scheduling/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: poolForm.name,
          strategy: poolForm.strategy,
          members,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Pool created');
      setPoolOpen(false);
      setPoolForm({ name: '', strategy: 'round_robin', membersText: '' });
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const createPlan = async () => {
    try {
      const res = await fetch('/api/scheduling/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planForm.name,
          description: planForm.description || undefined,
          jobTitle: planForm.jobTitle || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Interview plan created (screen → HM → panel)');
      setPlanOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const saveCalendar = async () => {
    if (!calForm.email) {
      toast.error('Email required');
      return;
    }
    setSavingCal(true);
    try {
      const res = await fetch('/api/scheduling/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Calendar preferences saved');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingCal(false);
    }
  };

  const createPortal = async () => {
    try {
      const res = await fetch('/api/scheduling/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portalForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLastPortalUrl(data.url);
      toast.success('Client portal link created');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const updateInterviewStatus = async (
    id: string,
    status: string,
    extra?: { action?: string }
  ) => {
    try {
      if (extra?.action === 'no_show') {
        const res = await fetch('/api/scheduling/interviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'no_show', interviewId: id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        toast.success('Marked no-show · recovery link ready');
        if (data.recoveryUrl) {
          await navigator.clipboard.writeText(data.recoveryUrl);
          toast.message('Recovery link copied to clipboard');
        }
      } else {
        const res = await fetch('/api/scheduling/interviews', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        toast.success(`Updated → ${status}`);
      }
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-primary" />
            Scheduling
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Self-schedule links, interviewer pools, job interview plans, stage
            writeback, client portals, no-show recovery, and analytics — built
            for agency recruiting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBookOpen(true)}>
            <Clock className="h-4 w-4 mr-1" />
            Admin book
          </Button>
          <Button size="sm" onClick={() => setLinkOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Self-schedule link
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading scheduling…
        </div>
      )}

      {!loading && tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Upcoming (7d)',
                value: analytics?.upcoming7d ?? 0,
                hint: 'Confirmed & scheduled',
              },
              {
                label: 'Open links',
                value: analytics?.openLinks ?? 0,
                hint: 'Unused self-schedule',
              },
              {
                label: 'No-show rate',
                value: analytics
                  ? `${Math.round(analytics.noShowRate * 100)}%`
                  : '—',
                hint: 'Completed + no-shows',
              },
              {
                label: 'Self-serve rate',
                value: analytics
                  ? `${Math.round(analytics.selfServeRate * 100)}%`
                  : '—',
                hint: 'Candidate-booked share',
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </div>
                <div className="mt-1 text-2xl font-semibold">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.hint}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold flex items-center gap-2">
                <Video className="h-4 w-4" />
                Next interviews
              </h2>
              {upcoming.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing upcoming. Create a self-schedule link or admin-book.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {upcoming.map((iv) => (
                    <li
                      key={iv.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{iv.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {new Date(iv.startAt).toLocaleString()}
                          {iv.candidateName ? ` · ${iv.candidateName}` : ''}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor(iv.status)}`}
                      >
                        {iv.status.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Setup checklist
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  {
                    ok: calendars.length > 0,
                    label: 'Calendar / working hours configured',
                    tab: 'calendars' as Tab,
                  },
                  {
                    ok: pools.length > 0,
                    label: 'Interviewer pool created',
                    tab: 'pools' as Tab,
                  },
                  {
                    ok: plans.length > 0,
                    label: 'Job interview plan (screen → HM → panel)',
                    tab: 'plans' as Tab,
                  },
                  {
                    ok: links.length > 0 || interviews.length > 0,
                    label: 'First self-schedule link or booking',
                    tab: 'links' as Tab,
                  },
                  {
                    ok: portals.length > 0,
                    label: 'Client interviewer portal',
                    tab: 'portals' as Tab,
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    />
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setTab(item.tab)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                Layer 1: self-schedule + calendars + stage writeback · Layer 2:
                pools + plans · Layer 3: sequence-ready links + no-show recovery ·
                Layer 4: client portal · Layer 5: panel holds + analytics.
              </p>
            </section>
          </div>
        </div>
      )}

      {!loading && tab === 'interviews' && (
        <div className="space-y-3">
          {interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interviews yet.</p>
          ) : (
            interviews.map((iv) => (
              <div
                key={iv.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{iv.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(iv.startAt).toLocaleString()} →{' '}
                    {new Date(iv.endAt).toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {iv.candidateName || iv.candidateId}
                    {iv.jobTitle ? ` · ${iv.jobTitle}` : ''}
                    {iv.stageWritten ? ` · stage: ${iv.stageWritten}` : ''}
                    {iv.mode ? ` · ${iv.mode}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor(iv.status)}`}
                  >
                    {iv.status.replace(/_/g, ' ')}
                  </span>
                  {iv.conferenceUrl && (
                    <a
                      href={iv.conferenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Join
                    </a>
                  )}
                  {iv.status !== 'completed' &&
                    iv.status !== 'cancelled' &&
                    iv.status !== 'no_show' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateInterviewStatus(iv.id, 'completed')
                          }
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateInterviewStatus(iv.id, 'no_show', {
                              action: 'no_show',
                            })
                          }
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          No-show
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateInterviewStatus(iv.id, 'cancelled')
                          }
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  {iv.recoveryLinkToken && (
                    <CopyButton
                      text={`${origin}/schedule/${iv.recoveryLinkToken}`}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'links' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setLinkOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New link
            </Button>
          </div>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No self-schedule links yet. Create one to send in email or
              sequences.
            </p>
          ) : (
            links
              .slice()
              .reverse()
              .map((l) => {
                const url = `${origin}/schedule/${l.token}`;
                const used = !!l.usedAt;
                const expired = new Date(l.expiresAt).getTime() < Date.now();
                return (
                  <div
                    key={l.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {l.interviewTypeName}
                          {l.candidateName ? ` · ${l.candidateName}` : ''}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {l.durationMinutes} min
                          {l.jobTitle ? ` · ${l.jobTitle}` : ''}
                          {' · '}
                          {used
                            ? 'Used'
                            : expired
                              ? 'Expired'
                              : `Expires ${new Date(l.expiresAt).toLocaleDateString()}`}
                        </div>
                        <code className="mt-2 block text-xs break-all text-muted-foreground">
                          {url}
                        </code>
                      </div>
                      <CopyButton text={url} />
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {!loading && tab === 'pools' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPoolOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New pool
            </Button>
          </div>
          {pools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create pools for round-robin screens or all-required panels.
            </p>
          ) : (
            pools.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Strategy: {p.strategy.replace(/_/g, ' ')} ·{' '}
                  {p.members?.length || 0} members
                </div>
                <ul className="mt-2 text-sm space-y-0.5">
                  {(p.members || []).map((m) => (
                    <li key={m.email} className="text-muted-foreground">
                      {m.name} &lt;{m.email}&gt; · {m.role}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'plans' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPlanOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New plan
            </Button>
          </div>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Plans define screen → HM → panel with durations and stage writeback.
            </p>
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="font-medium">{p.name}</div>
                {p.jobTitle && (
                  <div className="text-xs text-muted-foreground">{p.jobTitle}</div>
                )}
                <ol className="mt-3 space-y-2">
                  {(p.steps || []).map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 text-sm rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.durationMinutes} min · stage on book:{' '}
                          {s.stageOnBook}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'calendars' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-semibold">Your calendar preferences</h2>
            <p className="text-sm text-muted-foreground">
              Google / Microsoft live free-busy can use existing Email OAuth.
              Until then, working hours + busy blocks drive self-schedule slots
              (table stakes for stage-safe booking).
            </p>
            <div className="space-y-2">
              <div>
                <Label>Email</Label>
                <Input
                  value={calForm.email}
                  onChange={(e) =>
                    setCalForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="you@agency.com"
                />
              </div>
              <div>
                <Label>Display name</Label>
                <Input
                  value={calForm.name}
                  onChange={(e) =>
                    setCalForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Provider</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={calForm.provider}
                  onChange={(e) =>
                    setCalForm((f) => ({ ...f, provider: e.target.value }))
                  }
                >
                  <option value="manual">Manual working hours</option>
                  <option value="google">Google Calendar</option>
                  <option value="microsoft">Microsoft Outlook</option>
                </select>
              </div>
              <div>
                <Label>Timezone</Label>
                <Input
                  value={calForm.timezone}
                  onChange={(e) =>
                    setCalForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Buffer (min)</Label>
                  <Input
                    type="number"
                    value={calForm.bufferMinutes}
                    onChange={(e) =>
                      setCalForm((f) => ({
                        ...f,
                        bufferMinutes: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Max / day</Label>
                  <Input
                    type="number"
                    value={calForm.maxInterviewsPerDay}
                    onChange={(e) =>
                      setCalForm((f) => ({
                        ...f,
                        maxInterviewsPerDay: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={calForm.connected}
                  onChange={(e) =>
                    setCalForm((f) => ({ ...f, connected: e.target.checked }))
                  }
                />
                Mark as connected
              </label>
              <Button onClick={saveCalendar} disabled={savingCal}>
                {savingCal && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save calendar
              </Button>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Connected calendars</h2>
            {calendars.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                None yet — save yours to power availability.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {calendars.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {c.name || c.email}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({c.provider}
                        {c.connected ? ' · connected' : ''})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.timezone} · buffer {c.bufferMinutes}m · max{' '}
                      {c.maxInterviewsPerDay}/day
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {!loading && tab === 'portals' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 max-w-xl">
            <h2 className="font-semibold">Create client interviewer portal</h2>
            <p className="text-sm text-muted-foreground">
              Clients share availability and see upcoming interviews — no full
              ATS seat required (agency moat).
            </p>
            <div>
              <Label>Client / company name</Label>
              <Input
                value={portalForm.clientName}
                onChange={(e) =>
                  setPortalForm((f) => ({ ...f, clientName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input
                type="email"
                value={portalForm.contactEmail}
                onChange={(e) =>
                  setPortalForm((f) => ({
                    ...f,
                    contactEmail: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Contact name</Label>
              <Input
                value={portalForm.contactName}
                onChange={(e) =>
                  setPortalForm((f) => ({ ...f, contactName: e.target.value }))
                }
              />
            </div>
            <Button onClick={createPortal}>Create portal link</Button>
            {lastPortalUrl && (
              <div className="flex items-center gap-2 text-sm">
                <code className="break-all text-xs">{lastPortalUrl}</code>
                <CopyButton text={lastPortalUrl} />
              </div>
            )}
          </div>
          {portals.map((p) => {
            const url = `${origin}/client-schedule/${p.token}`;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-wrap justify-between gap-2"
              >
                <div>
                  <div className="font-medium">{p.clientName}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.contactName} · {p.contactEmail}
                    {p.availability?.length
                      ? ` · ${p.availability.length} availability blocks`
                      : ' · no availability yet'}
                  </div>
                  <code className="text-xs break-all text-muted-foreground">
                    {url}
                  </code>
                </div>
                <CopyButton text={url} />
              </div>
            );
          })}
        </div>
      )}

      {!loading && tab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ['Total interviews', analytics.totalInterviews],
              ['Active scheduled', analytics.scheduled],
              ['Completed', analytics.completed],
              ['No-shows', analytics.noShows],
              ['Cancelled', analytics.cancelled],
              [
                'No-show rate',
                `${Math.round(analytics.noShowRate * 100)}%`,
              ],
              [
                'Self-serve rate',
                `${Math.round(analytics.selfServeRate * 100)}%`,
              ],
              [
                'Avg reschedules',
                analytics.avgRescheduleCount.toFixed(2),
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div className="text-2xl font-semibold mt-1">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">By status</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(analytics.byStatus).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Interviewer load</h2>
              {analytics.interviewerLoad.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No participant data yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-1 text-sm">
                  {analytics.interviewerLoad.map((row) => (
                    <li key={row.email} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {row.name || row.email}
                      </span>
                      <span className="font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create self-schedule link</DialogTitle>
            <DialogDescription>
              Candidate picks a real open slot. Booking writes pipeline stage
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Candidate ID *</Label>
              <Input
                value={linkForm.candidateId}
                onChange={(e) =>
                  setLinkForm((f) => ({ ...f, candidateId: e.target.value }))
                }
                placeholder="lead / candidate id"
              />
            </div>
            <div>
              <Label>Candidate name</Label>
              <Input
                value={linkForm.candidateName}
                onChange={(e) =>
                  setLinkForm((f) => ({ ...f, candidateName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Candidate email</Label>
              <Input
                type="email"
                value={linkForm.candidateEmail}
                onChange={(e) =>
                  setLinkForm((f) => ({
                    ...f,
                    candidateEmail: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Interview type</Label>
              <Input
                value={linkForm.interviewTypeName}
                onChange={(e) =>
                  setLinkForm((f) => ({
                    ...f,
                    interviewTypeName: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Job title</Label>
              <Input
                value={linkForm.jobTitle}
                onChange={(e) =>
                  setLinkForm((f) => ({ ...f, jobTitle: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={linkForm.durationMinutes}
                  onChange={(e) =>
                    setLinkForm((f) => ({
                      ...f,
                      durationMinutes: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Stage on book</Label>
                <Input
                  value={linkForm.stageOnBook}
                  onChange={(e) =>
                    setLinkForm((f) => ({
                      ...f,
                      stageOnBook: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {plans.length > 0 && (
              <div>
                <Label>Interview plan (optional)</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={linkForm.planId}
                  onChange={(e) =>
                    setLinkForm((f) => ({ ...f, planId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {pools.length > 0 && (
              <div>
                <Label>Interviewer pool (optional)</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={linkForm.poolId}
                  onChange={(e) =>
                    setLinkForm((f) => ({ ...f, poolId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {lastLinkUrl && (
              <div className="rounded-lg bg-muted p-2 text-xs break-all flex gap-2 items-start">
                <span className="flex-1">{lastLinkUrl}</span>
                <CopyButton text={lastLinkUrl} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Close
            </Button>
            <Button onClick={createLink} disabled={creatingLink}>
              {creatingLink && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Create link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin book interview</DialogTitle>
            <DialogDescription>
              Drop a time on the calendar for VIP / last-minute cases. Stage
              writeback still runs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Candidate ID *</Label>
              <Input
                value={bookForm.candidateId}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, candidateId: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Candidate name</Label>
              <Input
                value={bookForm.candidateName}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, candidateName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={bookForm.title}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Start *</Label>
              <Input
                type="datetime-local"
                value={bookForm.startAt}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, startAt: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                value={bookForm.durationMinutes}
                onChange={(e) =>
                  setBookForm((f) => ({
                    ...f,
                    durationMinutes: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={adminBook} disabled={booking}>
              {booking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={poolOpen} onOpenChange={setPoolOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New interviewer pool</DialogTitle>
            <DialogDescription>
              Round-robin, any-one, or all-required (panel holds).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={poolForm.name}
                onChange={(e) =>
                  setPoolForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="HM pool — Acme"
              />
            </div>
            <div>
              <Label>Strategy</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={poolForm.strategy}
                onChange={(e) =>
                  setPoolForm((f) => ({ ...f, strategy: e.target.value }))
                }
              >
                <option value="round_robin">Round robin</option>
                <option value="any_one">Any one free</option>
                <option value="all_required">All required (panel)</option>
              </select>
            </div>
            <div>
              <Label>Members (one per line: Name &lt;email&gt;)</Label>
              <Textarea
                rows={4}
                value={poolForm.membersText}
                onChange={(e) =>
                  setPoolForm((f) => ({ ...f, membersText: e.target.value }))
                }
                placeholder={'Jane Doe <jane@client.com>\nBob <bob@agency.com>'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoolOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPool}>Create pool</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New interview plan</DialogTitle>
            <DialogDescription>
              Defaults to Recruiter screen → HM → Panel with stage writeback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={planForm.name}
                onChange={(e) =>
                  setPlanForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Job title (optional)</Label>
              <Input
                value={planForm.jobTitle}
                onChange={(e) =>
                  setPlanForm((f) => ({ ...f, jobTitle: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={planForm.description}
                onChange={(e) =>
                  setPlanForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPlan}>Create plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
