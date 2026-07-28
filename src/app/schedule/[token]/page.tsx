'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  Video,
  Phone,
  MapPin,
  AlertCircle,
} from 'lucide-react';

type Slot = { start: string; end: string };

type LinkMeta = {
  token: string;
  interviewTypeName: string;
  durationMinutes: number;
  locationType: string;
  candidateName?: string;
  jobTitle?: string;
  mode: string;
  expiresAt: string;
  minNoticeHours: number;
};

function formatSlot(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function dayKey(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function PublicSchedulePage() {
  const params = useParams();
  const token = String(params?.token || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkMeta | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<{
    title: string;
    startAt: string;
    conferenceUrl?: string;
    status: string;
  } | null>(null);

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    []
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/schedule/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setLink(data.link);
      setSlots(data.slots || []);
      if (data.link?.candidateName) setName(data.link.candidateName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.start, tz);
      const arr = map.get(k) || [];
      arr.push(s);
      map.set(k, arr);
    }
    return [...map.entries()];
  }, [slots, tz]);

  const book = async () => {
    if (!selected) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/schedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          startAt: selected,
          timezone: tz,
          candidateName: name || undefined,
          candidateEmail: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      setDone(data.interview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  const LocIcon =
    link?.locationType === 'phone'
      ? Phone
      : link?.locationType === 'onsite'
        ? MapPin
        : Video;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Calendar className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Schedule interview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {link?.interviewTypeName || 'Interview'}
          </h1>
          {link?.jobTitle && (
            <p className="mt-1 text-slate-600">{link.jobTitle}</p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading times…
          </div>
        )}

        {error && !done && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {done && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-4 text-xl font-semibold text-emerald-900">
              You&apos;re booked
            </h2>
            <p className="mt-2 text-emerald-800">{done.title}</p>
            <p className="mt-1 font-medium text-emerald-900">
              {formatSlot(done.startAt, tz)}
            </p>
            {done.conferenceUrl && (
              <a
                href={done.conferenceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                <Video className="h-4 w-4" />
                Join link
              </a>
            )}
            <p className="mt-4 text-xs text-emerald-700">
              A confirmation will appear on the recruiter&apos;s calendar. Add this
              time to your own calendar if you haven&apos;t already.
            </p>
          </div>
        )}

        {!loading && !done && link && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                <Clock className="h-3.5 w-3.5" />
                {link.durationMinutes} min
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                <LocIcon className="h-3.5 w-3.5" />
                {link.locationType}
              </span>
              <span className="text-xs text-slate-400">
                Times in {tz.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">
                Your name
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            {slots.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                No open times right now. Ask your recruiter for new options.
              </div>
            ) : (
              <div className="space-y-5">
                {byDay.map(([day, daySlots]) => (
                  <div key={day}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">
                      {formatSlot(daySlots[0].start, tz).split(',').slice(0, 2).join(',')}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {daySlots.map((s) => {
                        const active = selected === s.start;
                        return (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => setSelected(s.start)}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                              active
                                ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                          >
                            {new Intl.DateTimeFormat(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: tz,
                            }).format(new Date(s.start))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={!selected || booking}
              onClick={book}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {booking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Booking…
                </>
              ) : (
                'Confirm interview'
              )}
            </button>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          Powered by Trio Scheduling
        </p>
      </div>
    </div>
  );
}
