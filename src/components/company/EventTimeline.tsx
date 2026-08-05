'use client';

import { useState, useEffect, useMemo } from 'react';
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

type CompanyEventType =
  | 'NOTE'
  | 'STATUS_CHANGE'
  | 'COMPANY_ADDED'
  | 'CONTACT_ADDED'
  | string;

interface CompanyEvent {
  id: string;
  companyId?: string;
  eventType: CompanyEventType;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp?: string;
}

interface CompanyEventTimelineProps {
  companyId: string;
  initialEvents?: CompanyEvent[];
}

const noteTypes = [
  { value: 'general', label: 'General Note' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'email_sent', label: 'Email sent' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'proposal_sent', label: 'Proposal sent' },
  { value: 'contract_signed', label: 'Contract signed' },
  { value: 'placement_made', label: 'Placement made' },
  { value: 'check_in', label: 'Check-in' },
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
  if (l.includes('email')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (l.includes('meeting') || l.includes('demo'))
    return 'bg-violet-100 text-violet-800 border-violet-200';
  if (l.includes('proposal') || l.includes('contract'))
    return 'bg-amber-100 text-amber-900 border-amber-200';
  if (l.includes('phone') || l.includes('call') || l.includes('conversation'))
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (l.includes('follow')) return 'bg-sky-100 text-sky-800 border-sky-200';
  if (l.includes('invoice') || l.includes('billing'))
    return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (l.includes('placement') || l.includes('check'))
    return 'bg-teal-100 text-teal-800 border-teal-200';
  if (l.includes('status') || l.includes('stage'))
    return 'bg-purple-100 text-purple-800 border-purple-200';
  if (l.includes('contact')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (l.includes('added') || l.includes('created'))
    return 'bg-green-100 text-green-800 border-green-200';
  return 'bg-indigo-50 text-indigo-800 border-indigo-100';
}

function getActivityLabel(event: CompanyEvent): string {
  const meta = event.metadata || {};
  if (meta.noteTypeLabel) return String(meta.noteTypeLabel);
  if (meta.noteType) {
    const found = noteTypes.find((t) => t.value === meta.noteType);
    if (found) return found.label;
    return String(meta.noteType)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (event.eventType === 'NOTE') {
    // title often "Note - Email sent"
    const m = String(event.title || '').match(/^Note\s*[-–]\s*(.+)$/i);
    if (m) return m[1].trim();
    return 'Note';
  }
  if (event.eventType === 'STATUS_CHANGE') return 'Status change';
  if (event.eventType === 'COMPANY_ADDED') return 'Company added';
  if (event.eventType === 'CONTACT_ADDED') return 'Contact added';
  return (
    event.title ||
    String(event.eventType || 'Activity')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getActivityBody(event: CompanyEvent): string {
  if (event.metadata?.noteText) return String(event.metadata.noteText);
  if (event.description) return String(event.description);
  if (event.title && !event.title.startsWith('Note')) return event.title;
  return '—';
}

export function CompanyEventTimeline({
  companyId,
  initialEvents = [],
}: CompanyEventTimelineProps) {
  const [events, setEvents] = useState<CompanyEvent[]>(initialEvents);
  const [loading, setLoading] = useState(!initialEvents.length);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!initialEvents.length) {
      void fetchEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function fetchEvents() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/companies/${companyId}/events?limit=200`
      );
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      const list = Array.isArray(data.events) ? data.events : [];
      // Newest first
      list.sort(
        (a: CompanyEvent, b: CompanyEvent) =>
          new Date(b.createdAt || b.timestamp || 0).getTime() -
          new Date(a.createdAt || a.timestamp || 0).getTime()
      );
      setEvents(list);
      setPage(1);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNote() {
    // Detail text optional — type alone is enough
    try {
      setAddingNote(true);
      const response = await fetch(`/api/companies/${companyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote.trim(),
          noteType,
        }),
      });

      if (!response.ok) throw new Error('Failed to add note');

      const data = await response.json();
      if (data.success !== false) {
        setNewNote('');
        setNoteType('general');
        await fetchEvents();
        toast.success('Note saved');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      setError('Failed to add note');
      toast.error('Failed to save note');
    } finally {
      setAddingNote(false);
    }
  }

  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime()
    );
  }, [events]);

  const paged = useMemo(
    () => paginateItems(sortedEvents, page, DEFAULT_PAGE_SIZE),
    [sortedEvents, page]
  );

  return (
    <section
      data-ink-on-light
      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-slate-900"
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Notes &amp; Activity Log
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Account activity — emails, meetings, proposals, and follow-ups
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm sm:w-48"
        >
          {noteTypes.map((t) => (
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
          data-ink-keep
          className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          {addingNote ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Log'
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : sortedEvents.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No activity yet. Log the first note above.
        </p>
      ) : (
        <div className="space-y-3">
          <PaginationBar
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            onPageChange={setPage}
            itemLabel={paged.total === 1 ? 'activity' : 'activities'}
          />
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-36">
                  Date
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-44">
                  Action Type
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Note
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.slice.map((event, index) => {
                const label = getActivityLabel(event);
                return (
                  <tr
                    key={event.id || event.timestamp || index}
                    className="hover:bg-gray-50/60"
                  >
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                      {formatDateTime(event.createdAt || event.timestamp)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${noteTypeBadgeClass(label)}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ExpandableNoteText text={getActivityBody(event)} />
                      {event.createdBy &&
                        event.createdBy !== 'system' &&
                        event.createdBy !== 'user@turnkey.com' && (
                          <span className="block text-[11px] text-gray-400 mt-1">
                            by {event.createdBy}
                          </span>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </section>
  );
}
