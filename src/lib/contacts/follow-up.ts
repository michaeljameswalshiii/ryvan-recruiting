/**
 * Infer last-contacted / next-follow-up / last-booked dates from contact notes.
 */

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const BOOKED_RE =
  /\b(meeting|meet|booked|booking|interview|calendar|scheduled|on[\s-]?site|visit|appt|appointment)\b/i;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return toDateInputValue(d);
}

export function parseLocalDate(iso?: string | null): Date | null {
  const key = toDateInputValue(iso);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFollowUpDate(iso?: string | null): string {
  const date = parseLocalDate(iso);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function isFollowUpOverdue(iso?: string | null, now = new Date()): boolean {
  const date = parseLocalDate(iso);
  if (!date) return false;
  return startOfDay(date).getTime() < startOfDay(now).getTime();
}

export function activityTimestamp(act: {
  createdAt?: string;
  timestamp?: string;
  created_at?: string;
  date?: string;
}): Date | null {
  const raw = act.createdAt || act.timestamp || act.created_at || act.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDateFromNoteText(
  text: string,
  relativeTo: Date = new Date()
): Date | null {
  const t = String(text || "").trim();
  if (!t) return null;

  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : relativeTo.getFullYear();
    let date = new Date(year, month, day);
    if (!slash[3] && date.getTime() + 86400000 < startOfDay(relativeTo).getTime()) {
      date = new Date(year + 1, month, day);
    }
    if (!Number.isNaN(date.getTime())) return date;
  }

  const named = t.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    let year = named[3] ? Number(named[3]) : relativeTo.getFullYear();
    let date = new Date(year, month, day);
    if (!named[3] && date.getTime() + 86400000 < startOfDay(relativeTo).getTime()) {
      date = new Date(year + 1, month, day);
    }
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/\btomorrow\b/i.test(t)) return addDays(relativeTo, 1);
  if (/\btoday\b/i.test(t)) return startOfDay(relativeTo);
  if (/\bnext week\b/i.test(t)) return addDays(relativeTo, 7);
  if (/\bin a week\b/i.test(t)) return addDays(relativeTo, 7);
  const inWeeks = t.match(/\bin\s+(\d+)\s+weeks?\b/i);
  if (inWeeks) return addDays(relativeTo, Number(inWeeks[1]) * 7);
  if (/\bin\s+two\s+weeks?\b/i.test(t)) return addDays(relativeTo, 14);
  if (/\bin\s+three\s+weeks?\b/i.test(t)) return addDays(relativeTo, 21);
  const inDays = t.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDays) return addDays(relativeTo, Number(inDays[1]));

  const weekday = t.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (weekday) {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const target = days.indexOf(weekday[1].toLowerCase());
    const delta = ((target - relativeTo.getDay() + 7) % 7) || 7;
    return addDays(relativeTo, delta);
  }

  return null;
}

function activityBody(act: any): string {
  return String(
    act?.metadata?.noteText || act?.content || act?.description || act?.note || ""
  ).trim();
}

export function inferLastContacted(activities: any[]): string {
  let latest: Date | null = null;
  for (const act of activities || []) {
    const when = activityTimestamp(act);
    if (when && (!latest || when > latest)) latest = when;
  }
  return latest ? toDateInputValue(latest) : "";
}

export function inferLastBooked(activities: any[]): string {
  let best: Date | null = null;
  for (const act of activities || []) {
    const type = String(act?.type || act?.metadata?.noteType || "");
    const text = activityBody(act);
    if (!BOOKED_RE.test(type) && !BOOKED_RE.test(text)) continue;
    const when = activityTimestamp(act);
    const parsed = parseDateFromNoteText(text, when || new Date());
    const date = parsed || when;
    if (date && (!best || date > best)) best = date;
  }
  return best ? toDateInputValue(best) : "";
}

export function inferNextFollowUp(
  activities: any[],
  now = new Date()
): string {
  const today = startOfDay(now);
  const rows = [...(activities || [])].sort((a, b) => {
    const ta = activityTimestamp(a)?.getTime() || 0;
    const tb = activityTimestamp(b)?.getTime() || 0;
    return tb - ta;
  });

  for (const act of rows) {
    const when = activityTimestamp(act) || now;
    const parsed = parseDateFromNoteText(activityBody(act), when);
    if (parsed && startOfDay(parsed).getTime() >= today.getTime()) {
      return toDateInputValue(parsed);
    }
  }

  const latest = rows[0];
  if (!latest) return "";
  const latestWhen = activityTimestamp(latest);
  if (!latestWhen) return "";
  return toDateInputValue(addDays(latestWhen, 7));
}
