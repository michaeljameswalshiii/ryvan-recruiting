'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Video,
} from 'lucide-react';

type Availability = { start: string; end: string };

type InterviewRow = {
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  candidateName?: string;
  jobTitle?: string;
  locationType?: string;
  conferenceUrl?: string;
};

export default function ClientSchedulePortalPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  );
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/client-schedule/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setClientName(data.portal.clientName);
      setContactName(data.portal.contactName || '');
      setTimezone(data.portal.timezone || timezone);
      setAvailability(data.portal.availability || []);
      setInterviews(data.interviews || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const addBlock = () => {
    if (!newStart || !newEnd) return;
    const start = new Date(newStart).toISOString();
    const end = new Date(newEnd).toISOString();
    if (new Date(end) <= new Date(start)) {
      setError('End must be after start');
      return;
    }
    setAvailability((prev) => [...prev, { start, end }]);
    setNewStart('');
    setNewEnd('');
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/public/client-schedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability, timezone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Client interviewer portal
            </p>
            <h1 className="text-2xl font-semibold">
              {clientName || 'Your availability'}
            </h1>
            {contactName && (
              <p className="text-sm text-slate-600">Welcome, {contactName}</p>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Calendar className="h-4 w-4" />
                Share your availability
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Add open blocks so recruiters can book interviews without email
                ping-pong. Timezone: {timezone.replace(/_/g, ' ')}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Start
                  </label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    End
                  </label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addBlock}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Add block
              </button>

              <ul className="mt-4 space-y-2">
                {availability.length === 0 && (
                  <li className="text-sm text-slate-400">No blocks yet</li>
                )}
                {availability.map((a, i) => (
                  <li
                    key={`${a.start}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {new Date(a.start).toLocaleString()} →{' '}
                      {new Date(a.end).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAvailability((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        );
                        setSaved(false);
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : null}
                {saved ? 'Saved' : 'Save availability'}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Upcoming interviews
              </h2>
              {interviews.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  No interviews linked yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {interviews.map((iv, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-slate-100 px-4 py-3"
                    >
                      <div className="font-medium">{iv.title}</div>
                      <div className="mt-0.5 text-sm text-slate-600">
                        {new Date(iv.startAt).toLocaleString()} · {iv.status}
                      </div>
                      {iv.candidateName && (
                        <div className="text-sm text-slate-500">
                          Candidate: {iv.candidateName}
                        </div>
                      )}
                      {iv.conferenceUrl && (
                        <a
                          href={iv.conferenceUrl}
                          className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          Powered by Trio Scheduling
        </p>
      </div>
    </div>
  );
}
