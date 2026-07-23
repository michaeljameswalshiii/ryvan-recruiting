'use client';

/**
 * Dedicated results page for a Company List Builder agent run.
 * Select rows → import to Trio Companies (Identification) + Contacts.
 * Shows complete (email+phone) and partial (email or phone) leads.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCrmCaches } from '@/lib/hooks/invalidate-crm-cache';

type Row = {
  id: string;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  industry?: string;
  employeeCount?: number;
  companySize?: string;
  openJobsPosted?: number;
  contactName?: string;
  contactTitle?: string;
  email?: string;
  phone?: string;
  companyExists?: boolean;
  imported?: boolean;
  notes?: string;
  sourceUrl?: string;
  contactCompleteness?: 'complete' | 'partial';
  selected?: boolean;
};

type Job = {
  id: string;
  status: string;
  brief: string;
  geography: string;
  targetSize: number;
  visibility?: 'private' | 'public';
  isOwner?: boolean;
  progress: {
    found: number;
    target: number;
    lastMessage?: string;
    researched?: number;
    completeFound?: number;
    partialFound?: number;
  };
  results: Row[];
};

function isValidEmail(email?: string): boolean {
  const e = (email || '').trim();
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidPhone(phone?: string): boolean {
  const p = (phone || '').trim();
  return !!p && (p.match(/\d/g) || []).length >= 7;
}

function hasEmailAndPhone(r: Row): boolean {
  return isValidEmail(r.email) && isValidPhone(r.phone);
}

function isKeepable(r: Row): boolean {
  return isValidEmail(r.email) || isValidPhone(r.phone);
}

function rowCompleteness(r: Row): 'complete' | 'partial' | null {
  if (r.contactCompleteness === 'complete' || r.contactCompleteness === 'partial') {
    return r.contactCompleteness;
  }
  if (hasEmailAndPhone(r)) return 'complete';
  if (isKeepable(r)) return 'partial';
  return null;
}

export default function ListBuilderResultsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = String(params?.id || '');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/list-builder/${id}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Job not found');
        setJob(null);
        return;
      }
      const j = data.job as Job;
      const keepable = (j.results || []).filter(isKeepable);
      setJob({ ...j, results: keepable });
      // Prefer complete for default selection; include partials only if selected flag true
      setSelected(
        new Set(
          keepable
            .filter((r) => {
              if (r.imported) return false;
              if (r.selected === false) return false;
              if (r.selected === true) return true;
              // Default: select complete only
              return rowCompleteness(r) === 'complete';
            })
            .map((r) => r.id)
        )
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const jobStatusRef = useRef<string | undefined>(undefined);
  jobStatusRef.current = job?.status;
  const tickingRef = useRef(false);

  // Stable poll/tick — do not rebind interval when job object updates (that blocked ticks)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const tick = async () => {
      const status = jobStatusRef.current;
      if (!status || !['running', 'queued'].includes(status)) return;
      if (tickingRef.current || cancelled) return;
      tickingRef.current = true;
      try {
        await fetch(`/api/list-builder/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tick' }),
        });
        if (!cancelled) await load();
      } catch {
        /* quiet */
      } finally {
        tickingRef.current = false;
      }
    };

    const t = setInterval(() => {
      const status = jobStatusRef.current;
      if (!status) return;
      if (['running', 'queued', 'paused'].includes(status)) {
        void load();
      }
      if (status === 'running' || status === 'queued') {
        void tick();
      }
    }, 15_000);

    const kick = setTimeout(() => void tick(), 2_000);

    return () => {
      cancelled = true;
      clearInterval(t);
      clearTimeout(kick);
    };
  }, [id, load]);

  const rows = job?.results || [];
  const selectable = rows.filter((r) => !r.imported);
  const selectedCount = useMemo(
    () => selectable.filter((r) => selected.has(r.id)).length,
    [selectable, selected]
  );
  const completeCount = useMemo(
    () => rows.filter((r) => rowCompleteness(r) === 'complete').length,
    [rows]
  );
  const partialCount = useMemo(
    () => rows.filter((r) => rowCompleteness(r) === 'partial').length,
    [rows]
  );
  const researched = job?.progress?.researched || 0;
  const target = job?.targetSize || 50;
  const keepPct = Math.min(100, Math.round((rows.length / Math.max(target, 1)) * 100));

  const toggle = (rowId: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(rowId)) n.delete(rowId);
      else n.add(rowId);
      return n;
    });
  };

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(selectable.map((r) => r.id)) : new Set());
  };

  const selectCompleteOnly = () => {
    setSelected(
      new Set(
        selectable
          .filter((r) => rowCompleteness(r) === 'complete')
          .map((r) => r.id)
      )
    );
  };

  const importSelected = async () => {
    if (selectedCount === 0) {
      toast.error('Select at least one company');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/list-builder/${id}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIds: Array.from(selected),
          confirmed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Import failed');
      } else {
        toast.success(
          `Added ${data.importedCompanies || 0} companies and ${data.importedContacts || 0} contacts`
        );
        void invalidateCrmCaches(
          queryClient,
          ['create_company', 'create_contact'],
          { forceClients: true }
        );
        await load();
      }
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 bg-slate-50">
        <p className="text-slate-600">This list could not be found.</p>
        <Link href="/dashboard/general-ai-usage">
          <Button>Back to AI Assistant</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-violet-50/30">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-0.5 shrink-0 gap-1.5"
              onClick={() => router.push('/dashboard/general-ai-usage')}
            >
              <ArrowLeft className="h-4 w-4" />
              AI Assistant
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                  List results
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">
                  <Sparkles className="h-3 w-3" />
                  {job.status.replace(/_/g, ' ')}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${
                    job.visibility === 'public'
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-slate-50 text-slate-600 ring-slate-200'
                  }`}
                >
                  {job.visibility === 'public' ? 'Public · team' : 'Private'}
                  {job.isOwner === false ? ' (shared with you)' : ''}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">
                {job.brief} · {job.geography}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{selectedCount}</span>{' '}
              selected ·{' '}
              <span className="font-semibold text-slate-900">{rows.length}</span>{' '}
              leads
            </span>
            <Button
              type="button"
              disabled={importing || selectedCount === 0}
              onClick={() => void importSelected()}
              className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Add to Trio
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Progress strip */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-800">
              {rows.length} kept · {researched} researched · target {target}
            </span>
            <span className="text-xs text-slate-500">
              {completeCount} complete · {partialCount} partial
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400 transition-all"
              style={{ width: `${Math.max(keepPct, rows.length > 0 ? 4 : 0)}%` }}
            />
          </div>
          {job.progress?.lastMessage && (
            <p className="mt-2 text-xs text-slate-500">{job.progress.lastMessage}</p>
          )}
        </div>

        {/* Insight strip */}
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            {
              label: 'Kept leads',
              value: String(rows.length),
              sub: 'Email or phone found',
            },
            {
              label: 'Complete',
              value: String(completeCount),
              sub: 'Email + phone',
            },
            {
              label: 'Partial',
              value: String(partialCount),
              sub: 'Email or phone only',
            },
            {
              label: 'Ready to import',
              value: String(selectedCount),
              sub: 'Companies → Identification',
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {c.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {c.value}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{c.sub}</div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              No contacts yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              We keep companies when we find a public email or phone — never
              invented. Partial leads (one field only) appear with a badge once
              found. If the agent is still running, check back shortly.
            </p>
            <Link href="/dashboard/general-ai-usage" className="mt-6 inline-block">
              <Button variant="outline">Back to AI Assistant</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-violet-600"
                  checked={
                    selectable.length > 0 &&
                    selectable.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                Select all
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectCompleteOnly}
                  className="text-xs font-medium text-violet-700 hover:underline"
                >
                  Select complete only
                </button>
                <p className="text-xs text-slate-400">
                  Complete selected by default · partials optional
                </p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const completeness = rowCompleteness(r);
                return (
                  <li
                    key={r.id}
                    className={`flex flex-col gap-3 px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
                      selected.has(r.id) ? 'bg-violet-50/40' : 'hover:bg-slate-50/80'
                    } ${r.imported ? 'opacity-60' : ''}`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
                        disabled={!!r.imported}
                        checked={!r.imported && selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {r.companyName}
                          </span>
                          {completeness === 'complete' && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                              Complete
                            </span>
                          )}
                          {completeness === 'partial' && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-100">
                              Partial
                              {!isValidEmail(r.email)
                                ? ' · no email'
                                : !isValidPhone(r.phone)
                                  ? ' · no phone'
                                  : ''}
                            </span>
                          )}
                          {r.companyExists && (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 ring-1 ring-sky-100">
                              Already in Trio
                            </span>
                          )}
                          {r.imported && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                              Imported
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          {(r.city || r.state) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {[r.city, r.state].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {r.industry && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              {r.industry}
                            </span>
                          )}
                          {(r.companySize || r.employeeCount != null) && (
                            <span className="text-slate-600">
                              Size:{' '}
                              {r.companySize ||
                                (r.employeeCount != null
                                  ? `${r.employeeCount}`
                                  : '—')}
                              {r.employeeCount != null &&
                              r.companySize &&
                              !String(r.companySize).includes(String(r.employeeCount))
                                ? ` (~${r.employeeCount})`
                                : ''}
                            </span>
                          )}
                          {r.openJobsPosted != null && (
                            <span className="text-slate-600">
                              Open jobs: {r.openJobsPosted}
                            </span>
                          )}
                          {r.contactName && (
                            <span className="font-medium text-slate-800">
                              {r.contactName}
                              {r.contactTitle ? ` · ${r.contactTitle}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {isValidEmail(r.email) ? (
                            <a
                              href={`mailto:${r.email}`}
                              className="inline-flex items-center gap-1.5 text-violet-700 hover:underline"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              {r.email}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-slate-400">
                              <Mail className="h-3.5 w-3.5" />
                              No email
                            </span>
                          )}
                          {isValidPhone(r.phone) ? (
                            <a
                              href={`tel:${r.phone}`}
                              className="inline-flex items-center gap-1.5 text-slate-700 hover:underline"
                            >
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              {r.phone}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-slate-400">
                              <Phone className="h-3.5 w-3.5" />
                              No phone
                            </span>
                          )}
                          {(r.website || r.sourceUrl) && (
                            <a
                              href={
                                (r.sourceUrl || r.website || '').startsWith('http')
                                  ? r.sourceUrl || r.website
                                  : `https://${r.website}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Site
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
