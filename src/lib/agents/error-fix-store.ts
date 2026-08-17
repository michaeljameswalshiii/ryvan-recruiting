/**
 * Ledger of error clusters System Ops has already seen, PRed, skipped, or merged.
 * Survives "Clean recorded errors" so a later run can tell new vs handled.
 * @serverOnly
 */

import { getItem, putItem, tableNames } from "@/lib/db/dynamodb";
import { normalizePath } from "@/lib/observability/links";

export type ErrorFixStatus =
  | "open_pr"
  | "merged"
  | "skipped_config"
  | "skipped_infra"
  | "skipped_low_confidence"
  | "skipped_not_code"
  | "failed"
  | "blocked_no_github"
  | "resolved";

export type ErrorFixRecord = {
  clusterKey: string;
  name: string;
  path: string;
  message: string;
  status: ErrorFixStatus;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  handledAt: string;
  lastCount: number;
  rationale?: string;
};

export type ErrorFixLastRun = {
  at: string;
  detail: string;
  opened: number;
  skipped: number;
  failed: number;
  prs: Array<{ number: number; title: string; url: string }>;
};

export type ErrorFixLedger = {
  id: "ops-error-fixes";
  type: "ops_error_fixes";
  items: ErrorFixRecord[];
  lastRun?: ErrorFixLastRun;
  runningUntil?: string;
  updatedAt: string;
};

const DOC_ID = "ops-error-fixes";
const MAX_ITEMS = 200;

export function errorFingerprint(input: {
  name?: string;
  path?: string;
  message?: string;
}): string {
  const name = scrub(input.name || "Error").slice(0, 80);
  const path = normalizePath(input.path);
  const message = scrub(input.message || "")
    .replace(/\bdigest\s+[a-z0-9]+/gi, "digest")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id")
    .replace(/\b\d{4}-\d{2}-\d{2}t[\d:.z+-]+\b/gi, ":time")
    .replace(/\breq[_-]?id[:\s]+[a-z0-9-]+\b/gi, "req")
    .slice(0, 100);
  return `${name}|${path}|${message}`;
}

function scrub(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function emptyLedger(): ErrorFixLedger {
  return {
    id: DOC_ID,
    type: "ops_error_fixes",
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getErrorFixLedger(): Promise<ErrorFixLedger> {
  try {
    const doc = await getItem<ErrorFixLedger>(tableNames.profiles, { id: DOC_ID });
    if (!doc || doc.type !== "ops_error_fixes") return emptyLedger();
    return {
      ...emptyLedger(),
      ...doc,
      id: DOC_ID,
      type: "ops_error_fixes",
      items: Array.isArray(doc.items) ? doc.items : [],
    };
  } catch {
    return emptyLedger();
  }
}

export async function saveErrorFixLedger(ledger: ErrorFixLedger): Promise<void> {
  await putItem(tableNames.profiles, {
    ...ledger,
    id: DOC_ID,
    type: "ops_error_fixes",
    items: (ledger.items || []).slice(0, MAX_ITEMS),
    updatedAt: new Date().toISOString(),
  });
}

export function upsertFixRecord(
  ledger: ErrorFixLedger,
  next: ErrorFixRecord
): ErrorFixLedger {
  const items = ledger.items.filter((item) => item.clusterKey !== next.clusterKey);
  items.unshift(next);
  return { ...ledger, items: items.slice(0, MAX_ITEMS) };
}

export function findFixRecord(
  ledger: ErrorFixLedger,
  clusterKey: string
): ErrorFixRecord | undefined {
  return ledger.items.find((item) => item.clusterKey === clusterKey);
}

export function findFixRecordByPr(
  ledger: ErrorFixLedger,
  prNumber: number
): ErrorFixRecord | undefined {
  return ledger.items.find((item) => item.prNumber === prNumber);
}

export async function markFixMerged(input: {
  prNumber: number;
  clusterKey?: string;
}): Promise<ErrorFixRecord | null> {
  const ledger = await getErrorFixLedger();
  const now = new Date().toISOString();
  const existing =
    (input.clusterKey ? findFixRecord(ledger, input.clusterKey) : undefined) ||
    findFixRecordByPr(ledger, input.prNumber);
  if (!existing) {
    await saveErrorFixLedger(ledger);
    return null;
  }
  const updated: ErrorFixRecord = {
    ...existing,
    status: "merged",
    handledAt: now,
    lastSeenAt: existing.lastSeenAt,
  };
  await saveErrorFixLedger(upsertFixRecord(ledger, updated));
  return updated;
}
