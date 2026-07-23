'use client';

/**
 * In-assistant queue for BD list-builder jobs:
 * progress, partial results table, pause/resume/cancel, import selection.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Pause,
  Play,
  X,
  Building2,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCrmCaches } from '@/lib/hooks/invalidate-crm-cache';

export type ListBuilderJobDto = {
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
    batchesCompleted: number;
    lastMessage?: string;
  };
  results: Array<{
    id: string;
    companyName: string;
    website?: string;
    city?: string;
    contactName?: string;
    contactTitle?: string;
    email?: string;
    phone?: string;
    companyExists?: boolean;
    selected?: boolean;
    imported?: boolean;
    notes?: string;
  }>;
  expiresAt?: string;
};

const ACTIVE = new Set(['queued', 'running', 'paused']);

export function ListBuilderPanel() {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<ListBuilderJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [showStart, setShowStart] = useState(false);
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [seedCsv, setSeedCsv] = useState('');

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      // Slim list first (no giant results arrays) — keeps UI snappy
      const res = await fetch('/api/list-builder', {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      } else if (!res.ok) {
        console.warn('[ListBuilder] load failed', res.status, data);
      }
    } catch (err) {
      console.warn('[ListBuilder] load error', err);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Poll while any job active — status only; tick at most one job and not every poll
  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE.has(j.status));
    if (!hasActive) return;
    let tickToggle = 0;
    const t = setInterval(() => {
      void load({ quiet: true });
      // Every other poll (~24s), advance one running job (avoids stacking heavy batches)
      tickToggle += 1;
      if (tickToggle % 2 === 0) {
        const runnable = jobs.find(
          (x) => x.status === 'running' || x.status === 'queued'
        );
        if (runnable) {
          void fetch(`/api/list-builder/${runnable.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'tick' }),
          }).then(() => load({ quiet: true }));
        }
      }
    }, 12_000);
    return () => clearInterval(t);
  }, [jobs, load]);

  const loadFullJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/list-builder/${jobId}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.job) {
        const full = data.job as ListBuilderJobDto;
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, ...full } : j))
        );
        setSelected((prev) => {
          if (prev[jobId]?.size) return prev;
          return {
            ...prev,
            [jobId]: new Set(
              (full.results || [])
                .filter((r) => !r.imported)
                .map((r) => r.id)
            ),
          };
        });
      }
    } catch {
      /* ignore */
    }
  };

  const action = async (
    jobId: string,
    act: string,
    extra?: Record<string, unknown>
  ) => {
    setBusyId(jobId);
    try {
      const res = await fetch(`/api/list-builder/${jobId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Action failed');
      } else {
        toast.success(
          act === 'pause'
            ? 'Paused'
            : act === 'resume'
              ? 'Resumed'
              : act === 'cancel'
                ? 'Cancelled'
                : act === 'set_visibility'
                  ? extra?.visibility === 'public'
                    ? 'List is now public to your team'
                    : 'List is now private'
                  : 'Updated'
        );
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const startJob = async () => {
    if (!brief.trim() && !seedCsv.trim()) {
      toast.error('Describe the market or upload a CSV seed list');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch('/api/list-builder', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: brief.trim() || 'Seed list enrichment',
          // Geography / size inferred from brief + server defaults (no UI fields)
          visibility,
          seedCsv: seedCsv.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to start');
      } else {
        toast.success(
          visibility === 'public'
            ? 'List builder started — shared with your team'
            : 'List builder started — you can keep working'
        );
        setShowStart(false);
        setBrief('');
        setSeedCsv('');
        setVisibility('private');
        await load();
        if (data.job?.id) setExpandedId(data.job.id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const toggleRow = (jobId: string, rowId: string) => {
    setSelected((prev) => {
      const set = new Set(prev[jobId] || []);
      if (set.has(rowId)) set.delete(rowId);
      else set.add(rowId);
      return { ...prev, [jobId]: set };
    });
  };

  const [importProgressByJob, setImportProgressByJob] = useState<
    Record<string, string>
  >({});

  const importSelected = async (jobId: string) => {
    const ids = Array.from(selected[jobId] || []);
    if (ids.length === 0) {
      toast.error('Select at least one row');
      return;
    }
    setBusyId(jobId);
    setImportProgressByJob((prev) => ({
      ...prev,
      [jobId]: `Importing 0 of ${ids.length}…`,
    }));
    try {
      const { importListBuilderInBatches } = await import(
        '@/lib/list-builder/import-client'
      );
      const result = await importListBuilderInBatches({
        jobId,
        rowIds: ids,
        onProgress: (p) => {
          setImportProgressByJob((prev) => ({
            ...prev,
            [jobId]: p.message,
          }));
        },
      });
      if (!result.success) {
        toast.error(
          result.partial
            ? `${result.error || 'Import stopped'} · partial: ${result.importedCompanies} cos, ${result.importedContacts} contacts`
            : result.error || 'Import failed'
        );
      } else {
        toast.success(
          `Imported ${result.importedCompanies} companies, ${result.importedContacts} contacts`
        );
      }
      void invalidateCrmCaches(
        queryClient,
        ['create_company', 'create_contact'],
        { forceClients: true, soft: true }
      );
      await load();
    } finally {
      setBusyId(null);
      setImportProgressByJob((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  };

  const statusColor = (s: string) => {
    if (s === 'running' || s === 'queued') return 'bg-sky-100 text-sky-800 border-sky-200';
    if (s === 'paused') return 'bg-amber-100 text-amber-900 border-amber-200';
    if (s === 'awaiting_import' || s === 'completed')
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    if (s === 'cancelled' || s === 'failed') return 'bg-rose-100 text-rose-800 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-blue-100 bg-white/80">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Company List Builder</div>
            <div className="text-[11px] text-gray-500 truncate">
              Find companies and contacts while you keep working
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowStart((v) => !v)}
          >
            New list
          </Button>
        </div>
      </div>

      {showStart && (
        <div className="px-3 py-3 border-b border-blue-100 bg-white space-y-2">
          <label className="text-xs font-medium text-gray-700 block">
            What market should we research?
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            placeholder="e.g. Manufacturing companies in South Florida — hiring managers / HR for recruiting services"
          />
          <div>
            <label className="text-[11px] text-gray-600 block mb-1">Sharing</label>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-200 p-0.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`rounded px-2 py-1.5 text-xs font-medium ${
                  visibility === 'private'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`rounded px-2 py-1.5 text-xs font-medium ${
                  visibility === 'public'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Public
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
              {visibility === 'public'
                ? 'Teammates on your tenant can view and import this list.'
                : 'Only you can see this list.'}
            </p>
          </div>
          <div>
            <label className="text-[11px] text-gray-600 flex items-center gap-1">
              <Upload className="h-3 w-3" /> Optional CSV seed (company, website required)
            </label>
            <textarea
              value={seedCsv}
              onChange={(e) => setSeedCsv(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs font-mono"
              placeholder={
                'company,website,city,contact,email,phone\nAcme Inc,acme.com,Miami,,,'
              }
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowStart(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={busyId === 'new'}
              onClick={() => void startJob()}
            >
              {busyId === 'new' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Start job'
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {loading && jobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for lists…
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No lists yet. Click <span className="font-medium">New list</span> or ask the
            assistant to find companies for you.
          </div>
        ) : (
          <ul className="divide-y divide-blue-100">
            {jobs.map((j) => {
              const open = expandedId === j.id;
              const pct = Math.min(
                100,
                Math.round(((j.progress?.found || 0) / (j.targetSize || 1)) * 100)
              );
              return (
                <li key={j.id} className="bg-white/60">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-white/90"
                    onClick={() => {
                      if (open) {
                        setExpandedId(null);
                      } else {
                        setExpandedId(j.id);
                        // Fetch full results only when expanded (keeps list load fast)
                        void loadFullJob(j.id);
                      }
                    }}
                  >
                    <div className="mt-0.5 flex flex-col gap-1 shrink-0">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor(j.status)}`}
                      >
                        {j.status.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          j.visibility === 'public'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {j.visibility === 'public' ? 'Public' : 'Private'}
                        {j.isOwner === false ? ' · team' : ''}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {j.brief || 'List job'}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {j.progress?.found ?? 0}/{j.targetSize} · {j.geography}
                        {j.progress?.lastMessage
                          ? ` · ${j.progress.lastMessage}`
                          : ''}
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {open && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {j.isOwner !== false &&
                          (j.status === 'running' || j.status === 'queued') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={busyId === j.id}
                            onClick={() => void action(j.id, 'pause')}
                          >
                            <Pause className="h-3 w-3 mr-1" /> Pause
                          </Button>
                        )}
                        {j.isOwner !== false && j.status === 'paused' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={busyId === j.id}
                            onClick={() => void action(j.id, 'resume')}
                          >
                            <Play className="h-3 w-3 mr-1" /> Resume
                          </Button>
                        )}
                        {j.isOwner !== false && ACTIVE.has(j.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-rose-700"
                            disabled={busyId === j.id}
                            onClick={() => void action(j.id, 'cancel')}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        )}
                        {j.isOwner !== false && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void action(j.id, 'set_visibility', {
                                visibility:
                                  j.visibility === 'public'
                                    ? 'private'
                                    : 'public',
                              })
                            }
                            title="Works for older lists too — share with your tenant"
                          >
                            {j.visibility === 'public'
                              ? 'Make private'
                              : 'Share public'}
                          </Button>
                        )}
                        {(j.status === 'awaiting_import' ||
                          j.status === 'completed' ||
                          (j.results?.length || 0) > 0) && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            disabled={busyId === j.id}
                            onClick={() => void importSelected(j.id)}
                          >
                            {busyId === j.id && importProgressByJob[j.id]
                              ? importProgressByJob[j.id]
                              : 'Import selected to Trio'}
                          </Button>
                        )}
                      </div>
                      {busyId === j.id && importProgressByJob[j.id] && (
                        <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded px-2 py-1">
                          {importProgressByJob[j.id]} · keep this panel open
                        </p>
                      )}

                      {(j.results?.length || 0) === 0 ? (
                        <p className="text-xs text-gray-500 py-2">
                          {ACTIVE.has(j.status)
                            ? 'Researching… partial results will appear here.'
                            : 'No rows yet.'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                          <table className="w-full text-xs min-w-[640px]">
                            <thead>
                              <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                                <th className="px-2 py-1.5 w-8" />
                                <th className="px-2 py-1.5">Company</th>
                                <th className="px-2 py-1.5">City</th>
                                <th className="px-2 py-1.5">Contact</th>
                                <th className="px-2 py-1.5">Email</th>
                                <th className="px-2 py-1.5">Phone</th>
                                <th className="px-2 py-1.5">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {j.results.map((r) => (
                                <tr key={r.id} className="hover:bg-gray-50/80">
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="checkbox"
                                      disabled={!!r.imported}
                                      checked={
                                        r.imported
                                          ? false
                                          : selected[j.id]?.has(r.id) ?? true
                                      }
                                      onChange={() => toggleRow(j.id, r.id)}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 font-medium text-gray-900">
                                    <div className="truncate max-w-[140px]" title={r.companyName}>
                                      {r.companyName}
                                    </div>
                                    {r.website && (
                                      <div className="text-[10px] text-gray-400 truncate max-w-[140px]">
                                        {r.website}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-600">{r.city || '—'}</td>
                                  <td className="px-2 py-1.5">
                                    <div>{r.contactName || '—'}</div>
                                    {r.contactTitle && (
                                      <div className="text-[10px] text-gray-400">
                                        {r.contactTitle}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-[120px]">
                                    {r.email || '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-600">{r.phone || '—'}</td>
                                  <td className="px-2 py-1.5 text-[10px]">
                                    {r.imported
                                      ? 'Imported'
                                      : r.companyExists
                                        ? 'In Trio'
                                        : 'New'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400">
                        Never invents emails/phones. Contacts only imported when at least one
                        of name, email, or phone exists. Companies → Identification.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
