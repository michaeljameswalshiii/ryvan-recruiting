'use client';

/**
 * Results page for Candidate Search Agent (People Data Labs).
 * Select people → import into Trio candidates (leads).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
  Users,
  Linkedin,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCrmCaches } from '@/lib/hooks/invalidate-crm-cache';

type Row = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  skills?: string[];
  contactCompleteness?: 'complete' | 'partial' | 'profile';
  leadExists?: boolean;
  existingLeadId?: string;
  imported?: boolean;
  importedLeadId?: string;
  selected?: boolean;
  notes?: string;
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
    estimatedCostUsd?: number;
    pdlCalls?: number;
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

function rowCompleteness(r: Row): 'complete' | 'partial' | 'profile' {
  if (r.contactCompleteness) return r.contactCompleteness;
  if (isValidEmail(r.email) && isValidPhone(r.phone)) return 'complete';
  if (isValidEmail(r.email) || isValidPhone(r.phone)) return 'partial';
  return 'profile';
}

export default function CandidateListBuilderResultsPage() {
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

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/candidate-list-builder/${id}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Job not found');
        setJob(null);
        return;
      }
      const j = data.job as Job;
      const rows = j.results || [];
      setJob({ ...j, results: rows });
      setSelected(
        new Set(
          rows
            .filter((r) => {
              if (r.imported || r.leadExists) return false;
              if (r.selected === false) return false;
              if (r.selected === true) return true;
              return isValidEmail(r.email) || isValidPhone(r.phone);
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const tick = async () => {
      const status = jobStatusRef.current;
      if (!status || !['running', 'queued'].includes(status)) return;
      if (tickingRef.current || cancelled) return;
      tickingRef.current = true;
      try {
        await fetch(`/api/candidate-list-builder/${id}`, {
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
      const res = await fetch(`/api/candidate-list-builder/${id}`, {
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
          ? 'List is public — teammates can open and import it'
          : 'List is private — only you can see it'
      );
      await load();
    } finally {
      setSharingBusy(false);
    }
  };

  const rows = job?.results || [];
  const selectable = rows.filter((r) => !r.imported && !r.leadExists);
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
  const cost = job?.progress?.estimatedCostUsd || 0;
  const keepPct = Math.min(
    100,
    Math.round((rows.length / Math.max(target, 1)) * 100)
  );

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

  const selectWithEmail = () => {
    setSelected(
      new Set(selectable.filter((r) => isValidEmail(r.email)).map((r) => r.id))
    );
  };

  const importSelected = async () => {
    if (selectedCount === 0) {
      toast.error('Select at least one candidate');
      return;
    }
    setImporting(true);
    setImportProgress(`Importing 0 of ${selectedCount}…`);
    try {
      const { importCandidateListBuilderInBatches } = await import(
        '@/lib/candidate-list-builder/import-client'
      );
      const result = await importCandidateListBuilderInBatches({
        jobId: id,
        rowIds: Array.from(selected),
        onProgress: (p) => {
          setImportProgress(p.message);
        },
      });

      if (!result.success) {
        toast.error(
          result.partial
            ? `${result.error || 'Import stopped'} · partial: ${result.importedLeads} candidates saved`
            : result.error || 'Import failed'
        );
        void invalidateCrmCaches(queryClient, ['create_candidate'], {
          soft: true,
        });
        await load();
        return;
      }

      toast.success(
        `Added ${result.importedLeads} candidates` +
          (result.duplicates
            ? ` (${result.duplicates} already in Trio)`
            : '') +
          (result.skipped ? ` · ${result.skipped} skipped` : '')
      );
      void invalidateCrmCaches(queryClient, ['create_candidate'], {
        soft: true,
      });
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
        <p className="text-slate-600">This candidate list could not be found.</p>
        <Link href="/dashboard/general-ai-usage">
          <Button>Back to AI Assistant</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-sky-50/30">
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
                  Candidate results
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                  <Users className="h-3 w-3" />
                  {job.status.replace(/_/g, ' ')}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${
                    job.visibility === 'public'
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-slate-100 text-slate-600 ring-slate-200'
                  }`}
                >
                  {job.visibility === 'public' ? 'Public' : 'Private'}
                </span>
                {cost > 0 && (
                  <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">
                    ~${cost.toFixed(2)} PDL
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                {job.brief}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {job.geography} · {rows.length} kept / {target} target
                {researched > 0 ? ` · ${researched} scanned` : ''}
                {completeCount > 0 || partialCount > 0
                  ? ` · ${completeCount} complete · ${partialCount} partial`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job.isOwner !== false && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sharingBusy}
                onClick={() => void toggleSharing()}
              >
                {job.visibility === 'public' ? 'Make private' : 'Share public'}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={importing || selectedCount === 0}
              onClick={() => void importSelected()}
              className="bg-violet-600 hover:bg-violet-500"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {importProgress || 'Importing…'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Import {selectedCount} to Candidates
                </>
              )}
            </Button>
          </div>
        </div>
        {['running', 'queued'].includes(job.status) && (
          <div className="mx-auto max-w-6xl px-6 pb-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400 transition-all"
                style={{ width: `${Math.max(keepPct, 4)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {job.progress?.lastMessage || 'Searching People Data Labs…'}
            </p>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleAll(true)}
          >
            Select all importable
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleAll(false)}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectCompleteOnly}
          >
            Email + phone only
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectWithEmail}
          >
            With email
          </Button>
          <span className="ml-auto text-xs text-slate-500">
            <Sparkles className="mr-1 inline h-3 w-3" />
            Powered by People Data Labs
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-700">
              {['running', 'queued'].includes(job.status)
                ? 'Searching for candidates…'
                : 'No candidates kept yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {job.progress?.lastMessage ||
                'Try a broader title or geography if this finishes empty.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const c = rowCompleteness(r);
              const checked = selected.has(r.id);
              const disabled = r.imported || r.leadExists;
              return (
                <li
                  key={r.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                    checked
                      ? 'border-violet-300 ring-1 ring-violet-200'
                      : 'border-slate-200'
                  } ${disabled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
                      checked={checked && !disabled}
                      disabled={disabled}
                      onChange={() => toggle(r.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                            c === 'complete'
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                              : c === 'partial'
                                ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                : 'bg-slate-50 text-slate-600 ring-slate-200'
                          }`}
                        >
                          {c === 'complete'
                            ? 'Email + phone'
                            : c === 'partial'
                              ? 'Partial contact'
                              : 'Profile only'}
                        </span>
                        {r.imported && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200">
                            Imported
                          </span>
                        )}
                        {r.leadExists && !r.imported && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                            Already in Trio
                          </span>
                        )}
                      </div>
                      {(r.title || r.company) && (
                        <p className="mt-0.5 text-sm text-slate-600">
                          {r.title}
                          {r.title && r.company ? ' · ' : ''}
                          {r.company && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {r.company}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {r.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {r.email}
                          </span>
                        )}
                        {r.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {r.phone}
                          </span>
                        )}
                        {(r.location || r.city) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {r.location ||
                              [r.city, r.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {r.linkedinUrl && (
                          <a
                            href={r.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                          >
                            <Linkedin className="h-3 w-3" />
                            LinkedIn
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {r.skills && r.skills.length > 0 && (
                        <p className="mt-2 line-clamp-1 text-[11px] text-slate-500">
                          {r.skills.slice(0, 8).join(' · ')}
                        </p>
                      )}
                    </div>
                    {(r.importedLeadId || r.existingLeadId) && (
                      <Link
                        href={`/dashboard/candidates/${r.importedLeadId || r.existingLeadId}`}
                        className="shrink-0 text-xs font-medium text-violet-700 hover:underline"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
