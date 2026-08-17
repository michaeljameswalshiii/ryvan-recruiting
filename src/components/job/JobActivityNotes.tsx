'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ExpandableNoteText } from '@/components/shared/ExpandableNoteText';
import { FormatActivityNoteButton } from '@/components/shared/FormatActivityNoteButton';
import {
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import {
  ACTIVITY_BADGE_BASE_CLASS,
  activityBadgeStyle,
} from '@/lib/ui/activity-badge-colors';

/** Job activity log page size (15 rows per page). */
const PAGE_SIZE = 15;

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

// Badge colors: shared palette — see activity-badge-colors.ts

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

/**
 * Only show candidate events that belong to THIS job.
 * Prevents Ops Interested / AI fit / Attached from appearing on Finance (and vice versa).
 */
export function candidateEventBelongsToJob(
  ev: any,
  jobId: string,
  jobTitle?: string
): boolean {
  const meta = ev?.metadata || {};
  const jid = String(meta.jobId || meta.job_id || '').trim();
  if (jid) return jid === String(jobId);

  const titleMeta = String(meta.jobTitle || '').trim().toLowerCase();
  const body = eventBody(ev).toLowerCase();
  const jt = String(jobTitle || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const jtCompact = jt.replace(/\s+/g, '');

  const mentionsTitle = (text: string) => {
    if (!jt || jt.length < 4) return false;
    const t = text.toLowerCase().replace(/\s+/g, ' ');
    return t.includes(jt) || t.replace(/\s+/g, '').includes(jtCompact);
  };

  // Explicit snapshot title
  if (titleMeta && jt) {
    if (
      titleMeta === jt ||
      titleMeta.includes(jt) ||
      jt.includes(titleMeta) ||
      titleMeta.replace(/\s+/g, '') === jtCompact
    ) {
      return true;
    }
  }

  // Body names this job (AI fit, attached, free text) — but not only as
  // "different opportunity" (that means a *different* role).
  if (mentionsTitle(body)) {
    const diffOpp = body.match(
      /different opportunity[:\s—–-]+([^\n.;]+)/i
    );
    if (diffOpp) {
      const chunk = (diffOpp[1] || '').toLowerCase();
      // If the only match is inside the different-opportunity clause, this
      // event is NOT about that opportunity job.
      const before = body.slice(0, diffOpp.index ?? 0);
      if (!mentionsTitle(before) && mentionsTitle(chunk)) {
        return false;
      }
    }
    return true;
  }

  // Rejected / terminal: "not moving forward on this role … different opportunity – Other"
  // When this job is NOT the different opportunity, treat as belonging to this job
  // (candidate is linked here; "this role" is the req page we're viewing).
  const isTerminalType = (() => {
    const t = String(
      meta.noteType || meta.noteTypeLabel || ev?.eventType || ''
    )
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    return (
      t.includes('reject') ||
      t.includes('not interested') ||
      t === 'dnu' ||
      t.includes('do not use')
    );
  })();
  if (isTerminalType && /different opportunity/i.test(body)) {
    // Belongs to current job unless the different opportunity IS this job
    if (jt && mentionsTitle(body)) {
      const m = body.match(/different opportunity[:\s—–-]+([^\n.;]+)/i);
      const chunk = (m?.[1] || '').toLowerCase();
      if (chunk.includes(jt) || chunk.replace(/\s+/g, '').includes(jtCompact)) {
        return false;
      }
    }
    return true;
  }

  // Untagged notes that clearly name another role are excluded (no match above).
  // Untagged generic notes without this job title: exclude from job log to avoid
  // polluting Finance with Ops (and unrelated candidate chatter).
  return false;
}

export function JobActivityNotes({
  jobId,
  jobTitle,
  linkedCandidates = [],
  companyId,
  companyName,
}: {
  jobId: string;
  /** Used to match candidate events that only name the job in free text */
  jobTitle?: string;
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

  // Stable key so parent re-creating linkedCandidates arrays does not
  // re-fetch and force page back to 1 (which made pagination look broken).
  const candidateKey = useMemo(
    () =>
      (linkedCandidates || [])
        .map((c) => c.candidateId)
        .filter(Boolean)
        .join(','),
    [linkedCandidates]
  );

  const candidateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of linkedCandidates || []) {
      if (c.candidateId) {
        map.set(c.candidateId, c.candidateName || 'Candidate');
      }
    }
    return map;
  }, [linkedCandidates]);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const fetches: Promise<Response>[] = [
        fetch(`/api/jobs/${jobId}/events?limit=100`),
      ];

      const candIds = candidateKey
        ? candidateKey.split(',').filter(Boolean)
        : [];

      for (const cid of candIds.slice(0, 25)) {
        fetches.push(fetch(`/api/candidate/${cid}/events?limit=40`));
      }

      if (companyId) {
        fetches.push(
          fetch(`/api/companies/${companyId}/events?limit=50`).catch(
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

      // Candidate events — only those that belong to THIS job (not every
      // note on a multi-job candidate like Ops activity under Finance).
      for (let i = 0; i < candIds.slice(0, 25).length; i++) {
        const res = responses[1 + i];
        const cid = candIds[i];
        const name = candidateNameById.get(cid) || 'Candidate';
        try {
          if (res?.ok) {
            const data = await res.json();
            for (const ev of data.events || []) {
              if (!candidateEventBelongsToJob(ev, jobId, jobTitle)) continue;
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

      setRows(deduped.slice(0, 300));
    } catch (e) {
      console.error('[JobActivityNotes]', e);
    } finally {
      setLoading(false);
    }
  }, [jobId, jobTitle, candidateKey, candidateNameById, companyId, companyName]);

  // Reset to page 1 only when the data sources change (not on every parent render)
  useEffect(() => {
    setPage(1);
    void load();
  }, [jobId, jobTitle, candidateKey, companyId, companyName]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: avoid re-fetch on name map identity

  const paged = useMemo(
    () => paginateItems(rows, page, PAGE_SIZE),
    [rows, page]
  );

  // Keep page in range if the list shrinks (e.g. after reload)
  useEffect(() => {
    if (page > paged.totalPages) setPage(paged.totalPages);
  }, [page, paged.totalPages]);

  // Defensive: never render more than PAGE_SIZE rows even if paginateItems misbehaves
  const visibleRows = useMemo(() => {
    const start = (Math.max(1, paged.page) - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, paged.page]);

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
      setPage(1);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Notes &amp; Activity Log
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Job notes plus candidate activity tagged to this req
            {companyId ? ' (company events included)' : ''}
          </p>
        </div>
        {!loading && rows.length > 0 && (
          <span className="text-[11px] font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-full px-2.5 py-1 tabular-nums">
            {rows.length} total
            {paged.totalPages > 1
              ? ` · page ${paged.page}/${paged.totalPages}`
              : ` · ${PAGE_SIZE}/page`}
          </span>
        )}
      </div>

      <div className="flex flex-col items-stretch sm:flex-row sm:items-end gap-2 mb-5">
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
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Optional note detail..."
          rows={3}
          className="min-h-[76px] w-full min-w-0 flex-1 resize-y rounded-md border border-input bg-white px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleAddNote();
            }
          }}
        />
        <FormatActivityNoteButton
          value={newNote}
          onChange={setNewNote}
          disabled={addingNote}
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
        <div className="space-y-3">
          <PaginationBar
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={paged.total === 1 ? 'activity' : 'activities'}
            hideWhenSinglePage
          />
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
              <tbody key={`activity-page-${paged.page}`} className="divide-y divide-gray-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={ACTIVITY_BADGE_BASE_CLASS}
                        style={activityBadgeStyle(row.label)}
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
          {paged.totalPages > 1 && (
            <PaginationBar
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel={paged.total === 1 ? 'activity' : 'activities'}
            />
          )}
        </div>
      )}
    </section>
  );
}
