/**
 * Availability engine for interview scheduling.
 * Intersects working hours, buffers, busy blocks, existing interviews, and min notice.
 *
 * @serverOnly
 */

import type {
  CalendarConnection,
  Interview,
  ScheduleLink,
  WorkingHoursDay,
} from '@/lib/schemas/scheduling';
import { defaultWorkingHours } from '@/lib/db/repositories/scheduling-repository';

export type Slot = { start: string; end: string };

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/** Build local Date parts in a timezone (best-effort without full tz lib) */
function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || '0';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hourRaw = parseInt(get('hour'), 10);
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: parseInt(get('minute'), 10),
    weekday: weekdayMap[get('weekday')] ?? date.getUTCDay(),
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate candidate slots for a schedule link over the next N days.
 */
export function generateAvailableSlots(opts: {
  link: ScheduleLink;
  calendars: CalendarConnection[];
  existingInterviews: Interview[];
  daysAhead?: number;
  slotIntervalMinutes?: number;
  timeZone?: string;
}): Slot[] {
  const {
    link,
    calendars,
    existingInterviews,
    daysAhead = 14,
    slotIntervalMinutes = 30,
  } = opts;

  const duration = link.durationMinutes || 30;
  const tz =
    opts.timeZone ||
    calendars[0]?.timezone ||
    'America/New_York';
  const minNoticeMs = (link.minNoticeHours ?? 4) * 60 * 60 * 1000;
  const now = Date.now();
  const earliest = now + minNoticeMs;

  // Merge busy from all calendars + existing scheduled interviews
  const busy: { start: number; end: number }[] = [];
  for (const cal of calendars) {
    for (const b of cal.busyBlocks || []) {
      busy.push({
        start: new Date(b.start).getTime(),
        end: new Date(b.end).getTime(),
      });
    }
  }
  for (const iv of existingInterviews) {
    if (['cancelled', 'no_show', 'completed'].includes(iv.status)) continue;
    busy.push({
      start: new Date(iv.startAt).getTime(),
      end: new Date(iv.endAt).getTime(),
    });
  }

  // If proposed mode, only allow those slots
  if (link.mode === 'propose' && link.proposedSlots?.length) {
    return link.proposedSlots
      .filter((s) => {
        const start = new Date(s.start).getTime();
        const end = new Date(s.end).getTime();
        if (start < earliest) return false;
        if (busy.some((b) => overlaps(start, end, b.start, b.end))) return false;
        return true;
      })
      .map((s) => ({ start: s.start, end: s.end }));
  }

  // Working hours: use first calendar or defaults
  const hours: WorkingHoursDay[] =
    calendars[0]?.workingHours?.length
      ? calendars[0].workingHours
      : defaultWorkingHours();
  const bufferMs =
    (calendars[0]?.bufferMinutes ?? 10) * 60 * 1000;
  const maxPerDay = calendars[0]?.maxInterviewsPerDay ?? 6;

  const slots: Slot[] = [];
  const dayCounts = new Map<string, number>();

  // Walk days in UTC stepping 1 day, generate slots in TZ wall clock via probing
  for (let d = 0; d < daysAhead; d++) {
    const probe = new Date(now + d * 24 * 60 * 60 * 1000);
    const p0 = zonedParts(probe, tz);
    const dayKey = `${p0.year}-${p0.month}-${p0.day}`;
    const dayHours = hours.find((h) => h.day === p0.weekday);
    if (!dayHours?.enabled) continue;

    const { h: startH, m: startM } = parseHM(dayHours.start);
    const { h: endH, m: endM } = parseHM(dayHours.end);

    // Iterate minutes from start to end-duration in slotInterval
    for (
      let mins = startH * 60 + startM;
      mins + duration <= endH * 60 + endM;
      mins += slotIntervalMinutes
    ) {
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;

      // Construct approximate UTC from wall clock using iterative approach:
      // start from UTC noon of that calendar day and adjust
      const guess = new Date(
        Date.UTC(p0.year, p0.month - 1, p0.day, hour, minute, 0)
      );
      // Adjust so zoned parts match desired hour/minute
      for (let i = 0; i < 4; i++) {
        const zp = zonedParts(guess, tz);
        const deltaMin =
          (hour - zp.hour) * 60 +
          (minute - zp.minute) +
          (p0.day - zp.day) * 24 * 60;
        if (deltaMin === 0) break;
        guess.setTime(guess.getTime() + deltaMin * 60 * 1000);
      }

      const startMs = guess.getTime();
      const endMs = startMs + duration * 60 * 1000;
      if (startMs < earliest) continue;
      if (startMs > new Date(link.expiresAt).getTime()) continue;

      // Buffer-aware busy check
      const blockStart = startMs - bufferMs;
      const blockEnd = endMs + bufferMs;
      if (busy.some((b) => overlaps(blockStart, blockEnd, b.start, b.end))) {
        continue;
      }

      const count = dayCounts.get(dayKey) || 0;
      if (count >= maxPerDay) continue;
      dayCounts.set(dayKey, count + 1);

      slots.push({
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      });
    }
  }

  return slots.slice(0, 80);
}

/**
 * Pick next round-robin member email from pool, preferring free calendars.
 */
export function pickPoolMember(
  members: {
    email: string;
    name?: string;
    active?: boolean;
    weight?: number;
  }[],
  recentPickEmails: string[]
): { email: string; name?: string } | null {
  const active = members.filter((m) => m.active !== false);
  if (!active.length) return null;
  // Prefer members not recently used
  const sorted = [...active].sort((a, b) => {
    const aIdx = recentPickEmails.lastIndexOf(a.email);
    const bIdx = recentPickEmails.lastIndexOf(b.email);
    return aIdx - bIdx;
  });
  const pick = sorted[0];
  return { email: pick.email, name: pick.name };
}
