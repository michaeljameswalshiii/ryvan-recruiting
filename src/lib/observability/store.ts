/**
 * First-party ops telemetry in the profiles table (known keys, no extra infra).
 * @serverOnly
 */

import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getItem, getRawDynamoClient, tableNames } from "@/lib/db/dynamodb";
import type {
  CronHeartbeat,
  HourBucket,
  IngestEvent,
  StoredError,
  StoredEvent,
} from "./types";
import {
  hourBucketId,
  hourKey,
  legacyHourBucketId,
  normalizePath,
  recentErrorsId,
  recentEventsId,
} from "./links";

const LEGACY_ERRORS_ID = "ops-errors#recent";
const LEGACY_EVENTS_ID = "ops-events#recent";
const MAX_ERRORS = 80;
const MAX_EVENTS = 220;
const SLOW_MS = 2000;

type RecentErrorsDoc = {
  id: string;
  type: "ops_errors";
  items: StoredError[];
  updatedAt: string;
};

type RecentEventsDoc = {
  id: string;
  type: "ops_events";
  items: StoredEvent[];
  updatedAt: string;
};

function table(): string {
  return tableNames.profiles;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clusterKey(error: Pick<StoredError, "name" | "message" | "path">): string {
  return `${error.name}|${error.path}|${error.message.slice(0, 80)}`;
}

async function incrementHour(
  events: IngestEvent[],
  tenantId?: string | null
): Promise<void> {
  if (!events.length) return;
  let requests = 0;
  let errors = 0;
  let clientErrors = 0;
  let serverErrors = 0;
  let slow = 0;
  let totalMs = 0;
  let navCount = 0;
  let navTotalMs = 0;
  let lcpCount = 0;
  let lcpTotal = 0;

  for (const event of events) {
    if (event.kind === "api") {
      requests += 1;
      const ms = Math.max(0, Math.round(event.ms || 0));
      totalMs += ms;
      if (ms >= SLOW_MS) slow += 1;
      const status = Number(event.status || 0);
      if (status >= 500 || status === 0) {
        errors += 1;
        serverErrors += 1;
      } else if (status >= 400) {
        clientErrors += 1;
      }
    } else if (event.kind === "nav") {
      navCount += 1;
      navTotalMs += Math.max(0, Math.round(event.ms || 0));
    } else if (event.kind === "vital" && event.name === "LCP") {
      lcpCount += 1;
      lcpTotal += Math.max(0, Math.round(event.value || event.ms || 0));
    } else if (event.kind === "js_error" || event.kind === "server_error") {
      errors += 1;
      if (event.kind === "server_error") serverErrors += 1;
    }
  }

  const hour = hourKey();
  const client = getRawDynamoClient();
  const ids = Array.from(
    new Set(
      [
        hourBucketId(hour, "all"),
        tenantId && tenantId !== "all" ? hourBucketId(hour, tenantId) : null,
      ].filter(Boolean) as string[]
    )
  );

  await Promise.all(
    ids.map((id) =>
      client.send(
        new UpdateItemCommand({
          TableName: table(),
          Key: { id: { S: id } },
          UpdateExpression:
            "SET #type = if_not_exists(#type, :type), #hour = if_not_exists(#hour, :hour), updatedAt = :now ADD requests :requests, errors :errors, clientErrors :clientErrors, serverErrors :serverErrors, slow :slow, totalMs :totalMs, navCount :navCount, navTotalMs :navTotalMs, lcpCount :lcpCount, lcpTotal :lcpTotal",
          ExpressionAttributeNames: {
            "#type": "type",
            "#hour": "hour",
          },
          ExpressionAttributeValues: {
            ":type": { S: "ops_hour" },
            ":hour": { S: hour },
            ":now": { S: new Date().toISOString() },
            ":requests": { N: String(requests) },
            ":errors": { N: String(errors) },
            ":clientErrors": { N: String(clientErrors) },
            ":serverErrors": { N: String(serverErrors) },
            ":slow": { N: String(slow) },
            ":totalMs": { N: String(totalMs) },
            ":navCount": { N: String(navCount) },
            ":navTotalMs": { N: String(navTotalMs) },
            ":lcpCount": { N: String(lcpCount) },
            ":lcpTotal": { N: String(lcpTotal) },
          },
        })
      )
    )
  );
}

function toStoredEvents(events: IngestEvent[], now: string): StoredEvent[] {
  return events
    .filter((event) => event.kind === "api" || event.kind === "nav")
    .map((event) => ({
      t: now,
      kind: event.kind,
      path: normalizePath(event.path),
      status: Number.isFinite(event.status) ? Number(event.status) : undefined,
      ms: Math.max(0, Math.round(event.ms || 0)),
      name: event.name ? clip(event.name, 80) : undefined,
      message: event.message ? clip(event.message, 240) : undefined,
    }));
}

function toStoredErrors(events: IngestEvent[], now: string): StoredError[] {
  const next: StoredError[] = [];
  for (const event of events) {
    const isError =
      event.kind === "js_error" ||
      event.kind === "server_error" ||
      (event.kind === "api" && Number(event.status || 0) >= 500);
    if (!isError) continue;
    next.push({
      t: now,
      source: event.kind === "server_error" ? "server" : "browser",
      path: normalizePath(event.path),
      name: clip(event.name || (event.kind === "api" ? `HTTP ${event.status}` : "Error"), 120),
      message: clip(event.message || "Unknown error", 400),
      status: Number.isFinite(event.status) ? Number(event.status) : undefined,
      count: 1,
    });
  }
  return next;
}

function mergeErrors(existing: StoredError[], incoming: StoredError[]): StoredError[] {
  const map = new Map<string, StoredError>();
  for (const item of [...incoming, ...existing]) {
    const key = clusterKey(item);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item, count: item.count || 1 });
      continue;
    }
    prev.count = (prev.count || 1) + (item.count || 1);
    if (item.t > prev.t) prev.t = item.t;
  }
  return Array.from(map.values())
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, MAX_ERRORS);
}

async function prependList<T extends { items?: unknown[] }>(
  id: string,
  type: string,
  merge: (current: T | null) => T
): Promise<void> {
  const current = await getItem<T>(table(), { id });
  const next = merge(current);
  const { putItem } = await import("@/lib/db/dynamodb");
  await putItem(table(), { ...next, id, type, updatedAt: new Date().toISOString() });
}

export async function recordOpsEvents(
  events: IngestEvent[],
  opts?: { tenantId?: string | null }
): Promise<void> {
  const cleaned = events
    .filter((event) => event && event.kind)
    .slice(0, 40);
  if (!cleaned.length) return;

  const tenantId = opts?.tenantId && opts.tenantId !== "all" ? opts.tenantId : null;
  const now = new Date().toISOString();
  const storedEvents = toStoredEvents(cleaned, now);
  const storedErrors = toStoredErrors(cleaned, now);

  await incrementHour(cleaned, tenantId).catch((err) => {
    console.warn("[ops] hour increment failed", err);
  });

  const eventIds = Array.from(
    new Set([recentEventsId("all"), tenantId ? recentEventsId(tenantId) : null].filter(Boolean) as string[])
  );
  const errorIds = Array.from(
    new Set([recentErrorsId("all"), tenantId ? recentErrorsId(tenantId) : null].filter(Boolean) as string[])
  );

  if (storedEvents.length) {
    await Promise.all(
      eventIds.map((id) =>
        prependList<RecentEventsDoc>(id, "ops_events", (current) => ({
          id,
          type: "ops_events",
          items: [...storedEvents, ...(current?.items || [])].slice(0, MAX_EVENTS),
          updatedAt: now,
        })).catch((err) => {
          console.warn("[ops] event list failed", err);
        })
      )
    );
  }

  if (storedErrors.length) {
    await Promise.all(
      errorIds.map((id) =>
        prependList<RecentErrorsDoc>(id, "ops_errors", (current) => ({
          id,
          type: "ops_errors",
          items: mergeErrors(current?.items || [], storedErrors),
          updatedAt: now,
        })).catch((err) => {
          console.warn("[ops] error list failed", err);
        })
      )
    );
  }
}

export async function recordServerError(input: {
  path?: string;
  name?: string;
  message?: string;
}): Promise<void> {
  await recordOpsEvents([
    {
      kind: "server_error",
      path: input.path,
      name: input.name || "ServerError",
      message: input.message,
      status: 500,
    },
  ]);
}

export async function recordCronHeartbeat(input: {
  cronId: string;
  label: string;
  schedule: string;
  path: string;
  status: "ok" | "error";
  durationMs: number;
  detail?: string;
}): Promise<void> {
  try {
    const { putItem } = await import("@/lib/db/dynamodb");
    const item: CronHeartbeat = {
      id: `ops-cron#${input.cronId}`,
      type: "ops_cron",
      cronId: input.cronId,
      label: input.label,
      schedule: input.schedule,
      path: input.path,
      status: input.status,
      lastRunAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(input.durationMs || 0)),
      detail: input.detail ? clip(input.detail, 240) : undefined,
    };
    await putItem(table(), item);
  } catch (err) {
    console.warn("[ops] cron heartbeat failed", err);
  }
}

function normalizeBucket(hour: string, item: HourBucket | null): HourBucket | null {
  if (!item) return null;
  return {
    ...item,
    hour,
    requests: Number(item.requests || 0),
    errors: Number(item.errors || 0),
    clientErrors: Number(item.clientErrors || 0),
    serverErrors: Number(item.serverErrors || 0),
    slow: Number(item.slow || 0),
    totalMs: Number(item.totalMs || 0),
    navCount: Number(item.navCount || 0),
    navTotalMs: Number(item.navTotalMs || 0),
    lcpCount: Number(item.lcpCount || 0),
    lcpTotal: Number(item.lcpTotal || 0),
  };
}

function addBuckets(a: HourBucket | null, b: HourBucket | null): HourBucket | null {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    requests: a.requests + b.requests,
    errors: a.errors + b.errors,
    clientErrors: a.clientErrors + b.clientErrors,
    serverErrors: a.serverErrors + b.serverErrors,
    slow: a.slow + b.slow,
    totalMs: a.totalMs + b.totalMs,
    navCount: a.navCount + b.navCount,
    navTotalMs: a.navTotalMs + b.navTotalMs,
    lcpCount: a.lcpCount + b.lcpCount,
    lcpTotal: a.lcpTotal + b.lcpTotal,
  };
}

export async function getHourBuckets(
  hours: string[],
  tenantId?: string | null
): Promise<HourBucket[]> {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  const out: HourBucket[] = [];
  for (let i = 0; i < hours.length; i += 24) {
    const chunk = hours.slice(i, i + 24);
    const rows = await Promise.all(
      chunk.map(async (hour) => {
        try {
          const primary = normalizeBucket(
            hour,
            await getItem<HourBucket>(table(), { id: hourBucketId(hour, scope) })
          );
          if (scope !== "all") return primary;
          const legacy = normalizeBucket(
            hour,
            await getItem<HourBucket>(table(), { id: legacyHourBucketId(hour) })
          );
          return addBuckets(primary, legacy);
        } catch {
          return null;
        }
      })
    );
    for (const row of rows) {
      if (row) out.push(row);
    }
  }
  return out;
}

async function readEventDoc(id: string): Promise<StoredEvent[]> {
  try {
    const doc = await getItem<RecentEventsDoc>(table(), { id });
    return Array.isArray(doc?.items) ? doc.items : [];
  } catch {
    return [];
  }
}

async function readErrorDoc(id: string): Promise<StoredError[]> {
  try {
    const doc = await getItem<RecentErrorsDoc>(table(), { id });
    return Array.isArray(doc?.items) ? doc.items : [];
  } catch {
    return [];
  }
}

export async function getRecentEvents(tenantId?: string | null): Promise<StoredEvent[]> {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  const primary = await readEventDoc(recentEventsId(scope));
  if (scope !== "all") return primary;
  const legacy = await readEventDoc(LEGACY_EVENTS_ID);
  return [...primary, ...legacy]
    .sort((a, b) => String(b.t).localeCompare(String(a.t)))
    .slice(0, MAX_EVENTS);
}

export async function getRecentErrors(tenantId?: string | null): Promise<StoredError[]> {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  const primary = await readErrorDoc(recentErrorsId(scope));
  if (scope !== "all") return primary;
  const legacy = await readErrorDoc(LEGACY_ERRORS_ID);
  return mergeErrors(primary, legacy);
}

export async function clearRecentErrors(tenantId?: string | null): Promise<number> {
  const { putItem } = await import("@/lib/db/dynamodb");
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  const ids = [recentErrorsId(scope)];
  if (scope === "all") ids.push(LEGACY_ERRORS_ID);
  let cleared = 0;
  const now = new Date().toISOString();
  for (const id of ids) {
    const items = await readErrorDoc(id);
    cleared += items.length;
    await putItem(table(), {
      id,
      type: "ops_errors",
      items: [],
      updatedAt: now,
      clearedAt: now,
    });
  }
  return cleared;
}

export async function clearRecentEvents(tenantId?: string | null): Promise<number> {
  const { putItem } = await import("@/lib/db/dynamodb");
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  const ids = [recentEventsId(scope)];
  if (scope === "all") ids.push(LEGACY_EVENTS_ID);
  let cleared = 0;
  const now = new Date().toISOString();
  for (const id of ids) {
    const items = await readEventDoc(id);
    cleared += items.length;
    await putItem(table(), {
      id,
      type: "ops_events",
      items: [],
      updatedAt: now,
      clearedAt: now,
    });
  }
  return cleared;
}

export async function getCronHeartbeat(cronId: string): Promise<CronHeartbeat | null> {
  try {
    return await getItem<CronHeartbeat>(table(), { id: `ops-cron#${cronId}` });
  } catch {
    return null;
  }
}

export function listHourKeys(rangeMs: number, now = Date.now()): string[] {
  const hours = Math.max(1, Math.ceil(rangeMs / (60 * 60 * 1000)));
  const keys: string[] = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    keys.push(hourKey(new Date(now - i * 60 * 60 * 1000)));
  }
  return keys;
}
