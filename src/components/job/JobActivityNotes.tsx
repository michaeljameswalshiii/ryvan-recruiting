'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpandableNoteText } from '@/components/shared/ExpandableNoteText';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';

type LinkedCandidate = {
  candidateId?: string;
  candidateName?: string;
  stage?: string;
};

type ActivityRow = {
  id: string;
  createdAt: string;
  label: string;
  body: string;
  source: string;
  sourceHref?: string;
  createdBy?: string;
};

const NOTE_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'meeting', label: 'Client Call' },
  { value: 'phone_call', label: 'Interview' },
  { value: 'email_sent', label: 'Submittal' },
  { value: 'other', label: 'Other' },
];

function formatDateTime(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function noteTypeBadgeClass(label: string) {
  const l = String(label || '').toLowerCase();
  if (l.includes('email') || l.includes('submit'))
    return 'bg-blue-100 text-blue-800 border-blue-200';
  if (l.includes('interview') || l.includes('meeting') || l.includes('call'))
    return 'bg-violet-100 text-violet-800 border-violet-200';
  if (l.includes('stage') || l.includes('linked') || l.includes('unlink'))
    return 'bg-amber-100 text-amber-900 border-amber-200';
  if (l.includes('follow')) return 'bg-sky-100 text-sky-800 border-sky-200';
  if (l.includes('note') || l.includes('general'))
    return 'bg-indigo-50 text-indigo-800 border-indigo-100';
  if (l.includes('contact') || l.includes('company'))
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function eventLabel(ev: any): string {
  const meta = ev.metadata || {};
  if (meta.noteTypeLabel) return String(meta.noteTypeLabel);
  if (meta.noteType) {
    const found = NOTE_TYPES.find((t) => t.value === meta.noteType);
    if (found) return found.label;
    return String(meta.noteType).replace(/_/g, ' ');
  }
  const t = String(ev.eventType || '');
  if (t === 'NOTE') return 'Note';
  if (t === 'CANDIDATE_LINKED') return 'Candidate linked';
  if (t === 'CANDIDATE_UNLINKED') return 'Candidate unlinked';
  if (t === 'CANDIDATE_STAGE_CHANGED' || t === 'JOB_STAGE_CHANGED')
    return 'Stage change';
  if (t === 'JOB_STATUS_CHANGED') return 'Job status';
  if (t === 'JOB_CREATED') return 'Job created';
  if (t === 'JOB_UPDATED') return 'Job updated';
  if (t === 'CONTACT_ADDED') return 'Contact added';
  if (t === 'STATUS_CHANGE') return 'Status change';
  return (
    ev.title ||
    t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
    'Activity'
  );
}

function eventBody(ev: any): string {
  if (ev.metadata?.noteText) return String(ev.metadata.noteText);
  if (ev.description) return String(ev.description);
  if (ev.title) return String(ev.title);
  return '—';
}

export function JobActivityNotes({
  jobId,
  linkedCandidates = [],
  companyId,
  companyName,
}: {
  jobId: string;
  linkedCandidates?: LinkedCandidate[];
  companyId?: string;
  companyName?: string;
}) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const fetches: Promise<Response>[] = [
        fetch(`/api/jobs/${jobId}/events?limit=40`),
      ];

      const candIds = (linkedCandidates || [])
        .map((c) => c.candidateId)
        .filter(Boolean) as string[];

      for (const cid of candIds.slice(0, 25)) {
        fetches.push(fetch(`/api/candidate/${cid}/events?limit=15`));
      }

      if (companyId) {
        fetches.push(
          fetch(`/api/companies/${companyId}/events?limit=20`).catch(
            () => new Response(null)
          ) as Promise<Response>
        );
      }

      const responses = await Promise.all(fetches);
      const merged: ActivityRow[] = [];

      // Job events (index 0)
      try {
        if (responses[0]?.ok) {
          const data = await responses[0].json();
          for (const ev of data.events || []) {
            merged.push({
              id: `job-${ev.id || ev.SK || Math.random()}`,
              createdAt: ev.createdAt || ev.timestamp || '',
              label: eventLabel(ev),
              body: eventBody(ev),
              source: 'Job',
              createdBy: ev.createdBy,
            });
          }
        }
      } catch {
        /* ignore */
      }

      // Candidate events
      for (let i = 0; i < candIds.slice(0, 25).length; i++) {
        const res = responses[1 + i];
        const cid = candIds[i];
        const name =
          linkedCandidates.find((c) => c.candidateId === cid)?.candidateName ||
          'Candidate';
        try {
          if (res?.ok) {
            const data = await res.json();
            for (const ev of data.events || []) {
              merged.push({
                id: `cand-${cid}-${ev.id || ev.SK || Math.random()}`,
                createdAt: ev.createdAt || ev.timestamp || '',
                label: eventLabel(ev),
                body: eventBody(ev),
                source: name,
                sourceHref: `/dashboard/candidates/${cid}`,
                createdBy: ev.createdBy,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }

      // Company events (last)
      if (companyId) {
        const companyRes = responses[responses.length - 1];
        try {
          if (companyRes?.ok) {
            const data = await companyRes.json();
            for (const ev of data.events || []) {
              merged.push({
                id: `co-${ev.id || ev.SK || Math.random()}`,
                createdAt: ev.createdAt || ev.timestamp || '',
                label: eventLabel(ev),
                body: eventBody(ev),
                source: companyName || 'Company',
                sourceHref: `/dashboard/companies/${companyId}`,
                createdBy: ev.createdBy,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }

      merged.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );

      // Dedupe near-identical rows
      const seen = new Set<string>();
      const deduped = merged.filter((r) => {
        const key = `${r.createdAt}|${r.label}|${r.body.slice(0, 80)}|${r.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setRows(deduped.slice(0, 200));
      setPage(1);
    } catch (e) {
      console.error('[JobActivityNotes]', e);
    } finally {
      setLoading(false);
    }
  }, [jobId, linkedCandidates, companyId, companyName]);

  useEffect(() => {
    void load();
  }, [load]);

  const paged = useMemo(
    () => paginateItems(rows, page, DEFAULT_PAGE_SIZE),
    [rows, page]
  );

  const handleAddNote = async () => {
    if (!jobId) return;
    // Detail text optional
    setAddingNote(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote.trim(),
          noteType,
        }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      setNewNote('');
      setNoteType('general');
      toast.success('Activity logged');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Notes &amp; Activity Log
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Job notes plus activity from linked candidates
          {companyId ? ' and the company' : ''}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm sm:w-44"
        >
          {NOTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Optional note detail..."
          className="flex-1 bg-white"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleAddNote();
            }
          }}
        />
        <Button
          onClick={() => void handleAddNote()}
          disabled={addingNote}
          className="bg-blue-600 hover:bg-blue-700 shrink-0"
        >
          {addingNote ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Log'
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No activity yet. Log a note or link candidates to see their history.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-36">
                    Date
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-36">
                    Action Type
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Note
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-32">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.slice.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${noteTypeBadgeClass(row.label)}`}
                      >
                        {row.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ExpandableNoteText text={row.body} />
                    </td>
                    <td className="px-3 py-3 text-xs align-top">
                      {row.sourceHref ? (
                        <Link
                          href={row.sourceHref}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {row.source}
                        </Link>
                      ) : (
                        <span className="text-gray-500">{row.source}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={paged.total === 1 ? 'activity' : 'activities'}
            className="mt-3"
          />
        </>
      )}
    </section>
  );
}
