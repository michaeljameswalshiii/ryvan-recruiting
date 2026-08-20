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
  Pencil,
  RefreshCw,
  Sparkles,
  ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleDialog } from '@/components/ui/simple-dialog';
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
  rejected?: boolean;
  rejectedReason?: string;
  notes?: string;
  sourceUrl?: string;
  contactCompleteness?: 'complete' | 'partial';
  siteVerified?: boolean;
  geoVerified?: boolean;
  verificationStatus?: 'verified' | 'partial' | 'unverified';
  verificationNotes?: string;
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
  parentJobId?: string;
  revisedToJobId?: string;
  reviewReason?: string;
  industry?: string;
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

function rowVerification(
  r: Row
): 'verified' | 'partial' | 'unverified' {
  if (
    r.verificationStatus === 'verified' ||
    r.verificationStatus === 'partial' ||
    r.verificationStatus === 'unverified'
  ) {
    return r.verificationStatus;
  }
  // Legacy rows (pre-verification fields)
  if (r.siteVerified && r.geoVerified) return 'verified';
  if (r.siteVerified) return 'partial';
  return 'unverified';
}

function isVerifiedRow(r: Row): boolean {
  return rowVerification(r) === 'verified';
}

export default function ListBuilderResultsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = String(params?.id || '');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [editBrief, setEditBrief] = useState('');
  const [editGeo, setEditGeo] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editTarget, setEditTarget] = useState('50');
  const [actionReason, setActionReason] = useState('');

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
      // Default: site+geo verified only (quality gate). Respect explicit selected flags.
      setSelected(
        new Set(
          keepable
            .filter((r) => {
              if (r.imported || r.rejected) return false;
              if (r.selected === false) return false;
              if (r.selected === true) return true;
              return isVerifiedRow(r);
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

  const toggleSharing = async () => {
    if (!id || !job || job.isOwner === false) return;
    setSharingBusy(true);
    try {
      const next = job.visibility === 'public' ? 'private' : 'public';
      const res = await fetch(`/api/list-builder/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_visibility', visibility: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not update sharing');
        return;
      }
      toast.success(
        next === 'public'
          ? 'List is public — teammates on your tenant can open and import it'
          : 'List is private — only you can see it'
      );
      await load();
    } finally {
      setSharingBusy(false);
    }
  };

  const openEditor = (mode: 'edit' | 'revise') => {
    if (!job) return;
    setEditBrief(job.brief || '');
    setEditGeo(job.geography || '');
    setEditIndustry(job.industry || '');
    setEditTarget(String(job.targetSize || 50));
    setActionReason('');
    if (mode === 'edit') setEditOpen(true);
    else setReviseOpen(true);
  };

  const patchJob = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/list-builder/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  };

  const saveEdit = async () => {
    setActionBusy(true);
    try {
      await patchJob({
        action: 'update_search',
        brief: editBrief,
        geography: editGeo,
        industry: editIndustry,
        targetSize: Number(editTarget),
      });
      toast.success('Search details saved');
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setActionBusy(false);
    }
  };

  const runRevise = async () => {
    setActionBusy(true);
    try {
      const data = await patchJob({
        action: 'revise',
        brief: editBrief,
        geography: editGeo,
        industry: editIndustry,
        targetSize: Number(editTarget),
        reason: actionReason,
      });
      toast.success('Revised search started');
      setReviseOpen(false);
      const nextId = data.job?.id;
      if (nextId && nextId !== id) {
        router.push(`/dashboard/list-builder/${nextId}`);
        return;
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revise');
    } finally {
      setActionBusy(false);
    }
  };

  const declineSearch = async () => {
    setActionBusy(true);
    try {
      await patchJob({
        action: 'reject_search',
        reason: actionReason,
      });
      toast.success('Search declined — nothing imported, preference saved');
      setDeclineOpen(false);
      setActionReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setActionBusy(false);
    }
  };

  const rejectRow = async (rowId: string) => {
    try {
      await patchJob({ action: 'reject_rows', rowIds: [rowId] });
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(rowId);
        return n;
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject');
    }
  };

  const restoreRow = async (rowId: string) => {
    try {
      await patchJob({ action: 'restore_rows', rowIds: [rowId] });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restore');
    }
  };

  const rows = job?.results || [];
  const selectable = rows.filter((r) => !r.imported && !r.rejected);
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

  const selectVerifiedOnly = () => {
    setSelected(
      new Set(selectable.filter((r) => isVerifiedRow(r)).map((r) => r.id))
    );
  };

  const verifiedCount = useMemo(
    () => rows.filter((r) => isVerifiedRow(r)).length,
    [rows]
  );
  const partialVerifyCount = useMemo(
    () => rows.filter((r) => rowVerification(r) === 'partial').length,
    [rows]
  );

  const importSelected = async () => {
    if (selectedCount === 0) {
      toast.error('Select at least one company');
      return;
    }
    setImporting(true);
    setImportProgress(`Importing 0 of ${selectedCount}…`);
    try {
      const { importListBuilderInBatches } = await import(
        '@/lib/list-builder/import-client'
      );
      const result = await importListBuilderInBatches({
        jobId: id,
        rowIds: Array.from(selected),
        onProgress: (p) => {
          setImportProgress(p.message);
        },
      });

      if (!result.success) {
        toast.error(
          result.partial
            ? `${result.error || 'Import stopped'} · partial: ${result.importedCompanies} companies, ${result.importedContacts} contacts saved`
            : result.error || 'Import failed'
        );
        // Still soft-refresh — some rows may have landed
        void invalidateCrmCaches(
          queryClient,
          ['create_company', 'create_contact'],
          { forceClients: true, soft: true }
        );
        await load();
        return;
      }

      toast.success(
        `Added ${result.importedCompanies} companies and ${result.importedContacts} contacts` +
          (result.skipped ? ` (${result.skipped} skipped)` : '')
      );
      // Soft: mark CRM lists stale without refetching everything on this page
      void invalidateCrmCaches(
        queryClient,
        ['create_company', 'create_contact'],
        { forceClients: true, soft: true }
      );
      await load();
    } finally {
      setImporting(false);
      setImportProgress(null);
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
            {job.isOwner !== false && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openEditor('edit')}
                  className="gap-2"
                  title="Change the brief without starting a new run"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openEditor('revise')}
                  className="gap-2"
                  title="Rewrite the search and run a new list"
                >
                  <RefreshCw className="h-4 w-4" />
                  Revise
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActionReason('');
                    setDeclineOpen(true);
                  }}
                  className="gap-2 text-rose-700 hover:bg-rose-50"
                  title="Decline this search. Teaches the next run what not to find."
                >
                  <ThumbsDown className="h-4 w-4" />
                  Decline
                </Button>
              </>
            )}
            {job.isOwner !== false && (
              <Button
                type="button"
                variant="outline"
                disabled={sharingBusy}
                onClick={() => void toggleSharing()}
                className="gap-2"
                title="Share older and new lists with teammates on your tenant"
              >
                {sharingBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {job.visibility === 'public' ? 'Make private' : 'Share public'}
              </Button>
            )}
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
              {importing
                ? importProgress || 'Importing…'
                : 'Add to Trio'}
            </Button>
          </div>
        </div>
        {importing && importProgress && (
          <div className="border-t border-violet-100 bg-violet-50/80 px-6 py-2">
            <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm text-violet-900">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="font-medium">{importProgress}</span>
              <span className="text-xs text-violet-700/80">
                Batched import — keep this tab open
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {job.status === 'rejected' && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            This search was declined
            {job.reviewReason ? ` — ${job.reviewReason}` : ''}. That label
            trains the next list. Unlabeled lists do not.
            {job.revisedToJobId ? (
              <>
                {' '}
                <Link
                  href={`/dashboard/list-builder/${job.revisedToJobId}`}
                  className="font-semibold underline"
                >
                  Open the revised run
                </Link>
              </>
            ) : null}
          </div>
        )}
        {job.parentJobId && (
          <p className="mb-4 text-xs text-slate-500">
            Revised from an earlier search.{' '}
            <Link
              href={`/dashboard/list-builder/${job.parentJobId}`}
              className="font-medium text-violet-700 hover:underline"
            >
              View original
            </Link>
          </p>
        )}
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
              label: 'Partial contact',
              value: String(partialCount),
              sub: 'Email or phone only',
            },
            {
              label: 'Verified',
              value: String(verifiedCount),
              sub: 'Live site + geo match',
            },
            {
              label: 'Geo unconfirmed',
              value: String(partialVerifyCount),
              sub: 'Site OK, location soft',
            },
            {
              label: 'Ready to import',
              value: String(selectedCount),
              sub: 'Default = verified only',
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
              We keep companies with a reachable website, public contact, and
              location that fits the market — never invented contacts or dead
              domains. If the agent is still running, check back shortly.
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
                  onClick={selectVerifiedOnly}
                  className="text-xs font-medium text-violet-700 hover:underline"
                >
                  Select verified only
                </button>
                <button
                  type="button"
                  onClick={selectCompleteOnly}
                  className="text-xs font-medium text-slate-600 hover:underline"
                >
                  Select complete contact
                </button>
                <p className="text-xs text-slate-400">
                  Verified (site + geo) selected by default
                </p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const completeness = rowCompleteness(r);
                const verify = rowVerification(r);
                return (
                  <li
                    key={r.id}
                    className={`flex flex-col gap-3 px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
                      selected.has(r.id) ? 'bg-violet-50/40' : 'hover:bg-slate-50/80'
                    } ${r.imported || r.rejected ? 'opacity-60' : ''}`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
                        disabled={!!r.imported || !!r.rejected}
                        checked={!r.imported && !r.rejected && selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {r.companyName}
                          </span>
                          {verify === 'verified' && (
                            <span
                              className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100"
                              title={r.verificationNotes || 'Site + geo verified'}
                            >
                              Verified
                            </span>
                          )}
                          {verify === 'partial' && (
                            <span
                              className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900 ring-1 ring-sky-100"
                              title={
                                r.verificationNotes ||
                                'Site reachable; location not confirmed'
                              }
                            >
                              Site OK · geo?
                            </span>
                          )}
                          {verify === 'unverified' && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-800 ring-1 ring-rose-100">
                              Unverified
                            </span>
                          )}
                          {completeness === 'complete' && (
                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                              Email+phone
                            </span>
                          )}
                          {completeness === 'partial' && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-100">
                              {!isValidEmail(r.email)
                                ? 'No email'
                                : !isValidPhone(r.phone)
                                  ? 'No phone'
                                  : 'Partial contact'}
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
                          {r.rejected && (
                            <span
                              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-800 ring-1 ring-rose-100"
                              title={r.rejectedReason || 'Rejected'}
                            >
                              Rejected
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
                    {job.isOwner !== false && !r.imported && (
                      <div className="shrink-0 sm:pl-3">
                        {r.rejected ? (
                          <button
                            type="button"
                            onClick={() => void restoreRow(r.id)}
                            className="text-xs font-medium text-slate-600 hover:underline"
                          >
                            Undo reject
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void rejectRow(r.id)}
                            className="text-xs font-medium text-rose-700 hover:underline"
                            title="Reject this company. Teaches the next search."
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <SimpleDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit this search"
        description="Updates the brief on this list. Does not re-run and does not train the model."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={actionBusy} onClick={() => void saveEdit()}>
              {actionBusy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <SearchFields
          brief={editBrief}
          geo={editGeo}
          industry={editIndustry}
          target={editTarget}
          onBrief={setEditBrief}
          onGeo={setEditGeo}
          onIndustry={setEditIndustry}
          onTarget={setEditTarget}
        />
      </SimpleDialog>

      <SimpleDialog
        open={reviseOpen}
        onOpenChange={setReviseOpen}
        title="Revise and run again"
        description="Starts a new search from this one. The old list stays. This trains the next run toward the new brief."
        footer={
          <>
            <Button variant="outline" onClick={() => setReviseOpen(false)}>
              Cancel
            </Button>
            <Button disabled={actionBusy} onClick={() => void runRevise()}>
              {actionBusy ? 'Starting…' : 'Revise and run'}
            </Button>
          </>
        }
      >
        <SearchFields
          brief={editBrief}
          geo={editGeo}
          industry={editIndustry}
          target={editTarget}
          onBrief={setEditBrief}
          onGeo={setEditGeo}
          onIndustry={setEditIndustry}
          onTarget={setEditTarget}
        />
        <label className="mt-3 block text-sm font-medium text-slate-700">
          What should change?
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Too many national GCs — stay local, commercial only"
          />
        </label>
      </SimpleDialog>

      <SimpleDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline this search"
        description="Nothing is imported. The next list-builder run will treat this market mix as a miss."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              Keep list
            </Button>
            <Button
              disabled={actionBusy}
              className="bg-rose-600 hover:bg-rose-500"
              onClick={() => void declineSearch()}
            >
              {actionBusy ? 'Declining…' : 'Decline search'}
            </Button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700">
          Why is this off? (optional)
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Wrong geography, too large, not construction"
          />
        </label>
      </SimpleDialog>
    </div>
  );
}

function SearchFields({
  brief,
  geo,
  industry,
  target,
  onBrief,
  onGeo,
  onIndustry,
  onTarget,
}: {
  brief: string;
  geo: string;
  industry: string;
  target: string;
  onBrief: (v: string) => void;
  onGeo: (v: string) => void;
  onIndustry: (v: string) => void;
  onTarget: (v: string) => void;
}) {
  const field =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        Brief
        <textarea
          value={brief}
          onChange={(e) => onBrief(e.target.value)}
          rows={3}
          className={field}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Geography
          <input
            value={geo}
            onChange={(e) => onGeo(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Industry
          <input
            value={industry}
            onChange={(e) => onIndustry(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Target size
          <input
            type="number"
            min={1}
            max={100}
            value={target}
            onChange={(e) => onTarget(e.target.value)}
            className={field}
          />
        </label>
      </div>
    </div>
  );
}
