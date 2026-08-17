/**
 * Walk recorded / Vercel errors, skip handled clusters, open a GitHub PR
 * for new code bugs, and keep config/infra off the code path.
 * @serverOnly
 */

import {
  completeJson,
  fillJobRerankModelChain,
} from "@/lib/list-builder/llm-json";
import { getRecentErrors } from "@/lib/observability/store";
import { getVercelSnapshot } from "@/lib/observability/vercel";
import type { StoredError } from "@/lib/observability/types";
import { normalizePath } from "@/lib/observability/links";
import {
  type ErrorFixLastRun,
  type ErrorFixLedger,
  type ErrorFixRecord,
  type ErrorFixStatus,
  errorFingerprint,
  findFixRecord,
  getErrorFixLedger,
  saveErrorFixLedger,
  upsertFixRecord,
} from "./error-fix-store";
import {
  createBranch,
  createOpsPull,
  findOpenPullForCluster,
  getFileOnBranch,
  getGitHubRepo,
  githubConfigured,
  listOpenOpsPulls,
  putFilesOnBranch,
  type GitHubRepo,
  type OpsPull,
} from "./github-ops";

export type ErrorClass = "code" | "config" | "infra" | "unknown";
export type FixDecision = "act" | "skip";

export type ClusterWork = {
  clusterKey: string;
  name: string;
  path: string;
  message: string;
  count: number;
  lastSeenAt: string;
  source: "recorded" | "vercel";
  klass: ErrorClass;
  decision: FixDecision;
  reason: string;
  record?: ErrorFixRecord;
  openPull?: OpsPull;
};

export type FixRunResult = {
  ok: boolean;
  detail: string;
  newCount: number;
  handledCount: number;
  opened: number;
  skipped: number;
  failed: number;
  clusters: Array<{
    clusterKey: string;
    name: string;
    path: string;
    klass: ErrorClass;
    decision: FixDecision;
    status?: ErrorFixStatus;
    reason: string;
    prUrl?: string;
    prNumber?: number;
  }>;
  prs: Array<{ number: number; title: string; url: string }>;
};

export type OpsFixOverview = {
  githubConfigured: boolean;
  defaultBranch?: string;
  newCount: number;
  handledCount: number;
  openPrCount: number;
  skippedCount: number;
  mergedCount: number;
  openPulls: OpsPull[];
  lastRun?: ErrorFixLastRun;
};

const MAX_ACT = 3;
const MAX_FILES = 3;
const MAX_FILE_CHARS = 80_000;
const LOW_CONFIDENCE = 0.62;
const RETRY_LOW_MS = 12 * 60 * 60 * 1000;
const RECUR_GRACE_MS = 30 * 60 * 1000;
const RUN_LOCK_MS = 2 * 60 * 1000;

const ALLOWED_PREFIXES = ["src/", "cdk/"];
const BLOCKED_BITS = [
  ".env",
  "secret",
  "credential",
  "package-lock",
  "pnpm-lock",
  "id_rsa",
];

type LlmPatch = {
  class?: ErrorClass;
  confidence?: number;
  action?: "patch" | "skip";
  title?: string;
  rationale?: string;
  verify?: string;
  files?: Array<{
    path?: string;
    replacements?: Array<{ old?: string; new?: string }>;
  }>;
};

function classify(error: { name: string; message: string; path: string }): ErrorClass {
  const text = `${error.name} ${error.message} ${error.path}`.toLowerCase();
  if (
    /missing env|not configured|cron_secret|github_ops_token|vercel_token|api key|access denied|unauthorized|401/.test(
      text
    )
  ) {
    return "config";
  }
  if (
    /resourcenotfoundexception|provisionedthroughput|throttl|timed out connecting|econnrefused|unknownendpoint|table .* does not exist|no such host/.test(
      text
    )
  ) {
    return "infra";
  }
  if (
    /typeerror|referenceerror|syntaxerror|cannot read|undefined is not|is not a function|is not iterable|maximum call stack|max_tokens|max_completion_tokens|hydration|failed to parse/.test(
      text
    )
  ) {
    return "code";
  }
  if (/http 5\d\d|internal server error|servererror/.test(text)) return "code";
  return "unknown";
}

function shouldAct(
  record: ErrorFixRecord | undefined,
  cluster: { lastSeenAt: string; count: number },
  openPull: OpsPull | undefined,
  githubOn: boolean
): { decision: FixDecision; reason: string } {
  if (openPull) {
    return { decision: "skip", reason: `Open PR #${openPull.number} already covers this cluster.` };
  }
  if (!record) return { decision: "act", reason: "New cluster — not in the ledger." };

  if (record.status === "open_pr") {
    if (!githubOn) {
      return {
        decision: "skip",
        reason: record.prNumber
          ? `PR #${record.prNumber} is recorded. GitHub is not configured, so it is left handled.`
          : "A PR is recorded for this cluster.",
      };
    }
    const handled = Date.parse(record.handledAt);
    const seen = Date.parse(cluster.lastSeenAt);
    if (Number.isFinite(handled) && Number.isFinite(seen) && seen > handled + RECUR_GRACE_MS) {
      return {
        decision: "act",
        reason: "Previous PR is gone and the error returned — opening a new fix.",
      };
    }
    return {
      decision: "skip",
      reason: "Previous PR is no longer open and the error has not returned.",
    };
  }
  if (record.status === "merged" || record.status === "resolved") {
    const handled = Date.parse(record.handledAt);
    const seen = Date.parse(cluster.lastSeenAt);
    if (Number.isFinite(handled) && Number.isFinite(seen) && seen > handled + RECUR_GRACE_MS) {
      return {
        decision: "act",
        reason: "Error returned after the previous PR was merged — treating as new.",
      };
    }
    return { decision: "skip", reason: "Merged/resolved and the error has not returned." };
  }
  if (record.status === "skipped_config" || record.status === "skipped_infra") {
    return { decision: "skip", reason: `Already classified as ${record.status.replace("skipped_", "")}.` };
  }
  if (record.status === "skipped_not_code") {
    return { decision: "skip", reason: "Already judged not a code change." };
  }
  if (record.status === "skipped_low_confidence") {
    const age = Date.now() - Date.parse(record.handledAt);
    if (age >= RETRY_LOW_MS || cluster.count >= Math.max(4, record.lastCount * 2)) {
      return { decision: "act", reason: "Retrying a low-confidence skip (age or volume up)." };
    }
    return { decision: "skip", reason: "Low-confidence skip is still cooling down." };
  }
  if (record.status === "failed" || record.status === "blocked_no_github") {
    return { decision: "act", reason: "Previous attempt failed or was blocked — retry." };
  }
  return { decision: "act", reason: "New or retryable cluster." };
}

function candidateSourcePaths(errorPath: string): string[] {
  const p = normalizePath(errorPath).replace(/\/$/, "") || "/";
  const out: string[] = [];
  if (p.startsWith("/api/")) {
    out.push(`src/app${p}/route.ts`);
  } else if (p !== "/") {
    out.push(`src/app${p}/page.tsx`);
    out.push(`src/app${p}/route.ts`);
  }
  return out;
}

function allowedPath(path: string): boolean {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!ALLOWED_PREFIXES.some((prefix) => clean.startsWith(prefix))) return false;
  const lower = clean.toLowerCase();
  if (BLOCKED_BITS.some((bit) => lower.includes(bit))) return false;
  if (clean.includes("..")) return false;
  return true;
}

function applyReplacements(
  content: string,
  replacements: Array<{ old: string; new: string }>
): { next: string; applied: number; skipped: string[] } {
  let next = content;
  let applied = 0;
  const skipped: string[] = [];
  for (const item of replacements) {
    if (!item.old || item.old === item.new) {
      skipped.push("empty or unchanged replacement");
      continue;
    }
    const hits = next.split(item.old).length - 1;
    if (hits === 0) {
      skipped.push(`no match: ${item.old.slice(0, 60)}`);
      continue;
    }
    if (hits > 3) {
      skipped.push(`too many matches (${hits}): ${item.old.slice(0, 60)}`);
      continue;
    }
    next = next.split(item.old).join(item.new);
    applied += 1;
  }
  return { next, applied, skipped };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "error";
}

function shortKey(clusterKey: string): string {
  let hash = 0;
  for (let i = 0; i < clusterKey.length; i += 1) {
    hash = (hash * 31 + clusterKey.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).slice(0, 8);
}

async function collectClusters(): Promise<
  Array<{
    clusterKey: string;
    name: string;
    path: string;
    message: string;
    count: number;
    lastSeenAt: string;
    source: "recorded" | "vercel";
  }>
> {
  const [recorded, vercel] = await Promise.all([
    getRecentErrors().catch(() => [] as StoredError[]),
    getVercelSnapshot("24h").catch(() => null),
  ]);
  const map = new Map<
    string,
    {
      clusterKey: string;
      name: string;
      path: string;
      message: string;
      count: number;
      lastSeenAt: string;
      source: "recorded" | "vercel";
    }
  >();

  for (const error of recorded) {
    const clusterKey = errorFingerprint(error);
    const prev = map.get(clusterKey);
    const lastSeenAt = error.t || new Date().toISOString();
    const count = error.count || 1;
    if (!prev) {
      map.set(clusterKey, {
        clusterKey,
        name: error.name,
        path: error.path,
        message: error.message,
        count,
        lastSeenAt,
        source: "recorded",
      });
    } else {
      prev.count += count;
      if (lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = lastSeenAt;
    }
  }

  for (const cluster of vercel?.errorClusters || []) {
    const error = {
      name: cluster.name,
      path: cluster.path || "/",
      message: cluster.sample || cluster.name,
    };
    const clusterKey = errorFingerprint(error);
    const prev = map.get(clusterKey);
    const lastSeenAt = cluster.lastSeen || new Date().toISOString();
    if (!prev) {
      map.set(clusterKey, {
        clusterKey,
        name: error.name,
        path: error.path,
        message: error.message,
        count: cluster.count || 1,
        lastSeenAt,
        source: "vercel",
      });
    } else {
      prev.count += cluster.count || 1;
      if (lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = lastSeenAt;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function planErrorFixes(): Promise<{
  clusters: ClusterWork[];
  ledger: ErrorFixLedger;
  openPulls: OpsPull[];
}> {
  const [raw, ledger, openPulls] = await Promise.all([
    collectClusters(),
    getErrorFixLedger(),
    githubConfigured() ? listOpenOpsPulls().catch(() => [] as OpsPull[]) : Promise.resolve([] as OpsPull[]),
  ]);

  const clusters: ClusterWork[] = raw.map((item) => {
    const record = findFixRecord(ledger, item.clusterKey);
    const openPull = openPulls.find((pull) => pull.clusterKey === item.clusterKey);
    const klass = classify(item);
    const { decision, reason } = shouldAct(record, item, openPull, githubConfigured());
    return { ...item, klass, decision, reason, record, openPull };
  });

  return { clusters, ledger, openPulls };
}

export async function getOpsFixOverview(): Promise<OpsFixOverview> {
  const github = githubConfigured();
  let defaultBranch: string | undefined;
  if (github) {
    try {
      defaultBranch = (await getGitHubRepo()).defaultBranch;
    } catch {
      defaultBranch = undefined;
    }
  }
  const { clusters, ledger, openPulls } = await planErrorFixes();
  const newCount = clusters.filter((c) => c.decision === "act").length;
  const handledCount = clusters.filter((c) => c.decision === "skip").length;
  const skippedCount = ledger.items.filter((i) => i.status.startsWith("skipped_")).length;
  const mergedCount = ledger.items.filter((i) => i.status === "merged" || i.status === "resolved").length;
  return {
    githubConfigured: github,
    defaultBranch,
    newCount,
    handledCount,
    openPrCount: openPulls.length,
    skippedCount,
    mergedCount,
    openPulls,
    lastRun: ledger.lastRun,
  };
}

async function proposePatch(input: {
  cluster: ClusterWork;
  files: Array<{ path: string; content: string }>;
}): Promise<LlmPatch | null> {
  const system = `You are Trio System Ops. Fix a production error with the smallest safe code change.

Rules:
- Only fix the given error. Do not refactors, renames, or drive-by edits.
- Prefer a targeted replacement over a rewrite.
- Do not add dependencies, env secrets, or new infra.
- If the error is missing config or missing cloud resources, set action to skip.
- Replacements.old must be an exact substring of the provided file.
- Return ONLY JSON.

{
  "class": "code" | "config" | "infra" | "unknown",
  "confidence": 0-1,
  "action": "patch" | "skip",
  "title": "fix(ops): short title",
  "rationale": "one paragraph",
  "verify": "how a human confirms this",
  "files": [{ "path": "src/...", "replacements": [{ "old": "exact", "new": "exact" }] }]
}`;

  const fileBlock = input.files
    .map((file) => `FILE ${file.path}\n${file.content.slice(0, MAX_FILE_CHARS)}`)
    .join("\n\n----\n\n");

  const user = `ERROR
name: ${input.cluster.name}
path: ${input.cluster.path}
message: ${input.cluster.message}
count: ${input.cluster.count}
heuristicClass: ${input.cluster.klass}

SOURCE
${fileBlock || "(no source files found for this route)"}`;

  const result = await completeJson<LlmPatch>(
    system,
    user,
    { purpose: "system-ops-fix", queryPreview: input.cluster.name },
    {
      modelIds: fillJobRerankModelChain(),
      temperature: 0.1,
      maxTokens: 4096,
      timeoutMs: 45_000,
    }
  );
  return result.data || null;
}

function recordFromCluster(
  cluster: ClusterWork,
  status: ErrorFixStatus,
  extra?: Partial<ErrorFixRecord>
): ErrorFixRecord {
  const now = new Date().toISOString();
  return {
    clusterKey: cluster.clusterKey,
    name: cluster.name,
    path: cluster.path,
    message: cluster.message.slice(0, 240),
    status,
    firstSeenAt: cluster.record?.firstSeenAt || now,
    lastSeenAt: cluster.lastSeenAt,
    handledAt: now,
    lastCount: cluster.count,
    rationale: extra?.rationale || cluster.reason,
    prUrl: extra?.prUrl,
    prNumber: extra?.prNumber,
    branch: extra?.branch,
  };
}

async function fixOne(
  cluster: ClusterWork,
  repo: GitHubRepo | null
): Promise<{ record: ErrorFixRecord; pull?: OpsPull }> {
  if (cluster.klass === "config" || cluster.klass === "infra") {
    return {
      record: recordFromCluster(
        cluster,
        cluster.klass === "config" ? "skipped_config" : "skipped_infra",
        {
          rationale: `Not a code change (${cluster.klass}): ${cluster.message.slice(0, 160)}`,
        }
      ),
    };
  }

  if (!repo) {
    return {
      record: recordFromCluster(cluster, "blocked_no_github", {
        rationale: "GITHUB_OPS_TOKEN is missing, so no PR was opened.",
      }),
    };
  }

  const guessed = candidateSourcePaths(cluster.path);
  const loaded: Array<{ path: string; content: string }> = [];
  for (const path of guessed) {
    const file = await getFileOnBranch(repo, path, repo.defaultBranch);
    if (file) loaded.push({ path: file.path, content: file.content.slice(0, MAX_FILE_CHARS) });
  }

  const proposal = await proposePatch({ cluster, files: loaded });
  if (!proposal) {
    return {
      record: recordFromCluster(cluster, "failed", { rationale: "Model did not return a patch." }),
    };
  }

  const klass = proposal.class || cluster.klass;
  if (proposal.action === "skip" || klass === "config" || klass === "infra") {
    const status: ErrorFixStatus =
      klass === "config"
        ? "skipped_config"
        : klass === "infra"
          ? "skipped_infra"
          : "skipped_not_code";
    return {
      record: recordFromCluster(cluster, status, {
        rationale: proposal.rationale || "Model skipped this cluster.",
      }),
    };
  }

  const confidence = Number(proposal.confidence ?? 0);
  if (confidence < LOW_CONFIDENCE) {
    return {
      record: recordFromCluster(cluster, "skipped_low_confidence", {
        rationale: `Confidence ${confidence.toFixed(2)} below ${LOW_CONFIDENCE}. ${proposal.rationale || ""}`.trim(),
      }),
    };
  }

  const patched: Array<{ path: string; content: string }> = [];
  const notes: string[] = [];
  for (const file of (proposal.files || []).slice(0, MAX_FILES)) {
    const path = String(file.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!allowedPath(path)) {
      notes.push(`blocked path ${path}`);
      continue;
    }
    let current = loaded.find((item) => item.path === path)?.content;
    if (current == null) {
      const fetched = await getFileOnBranch(repo, path, repo.defaultBranch);
      current = fetched?.content;
    }
    if (current == null) {
      notes.push(`missing ${path}`);
      continue;
    }
    const reps = (file.replacements || [])
      .map((item) => ({ old: String(item.old || ""), new: String(item.new || "") }))
      .filter((item) => item.old);
    const applied = applyReplacements(current, reps);
    if (applied.applied === 0 || applied.next === current) {
      notes.push(`no-op ${path}${applied.skipped[0] ? ` (${applied.skipped[0]})` : ""}`);
      continue;
    }
    patched.push({ path, content: applied.next });
  }

  if (!patched.length) {
    return {
      record: recordFromCluster(cluster, "failed", {
        rationale: `Could not apply a patch. ${notes.join("; ") || proposal.rationale || ""}`.trim(),
      }),
    };
  }

  const branch = `ops/fix-${slug(cluster.name)}-${shortKey(cluster.clusterKey)}`;
  const title = (proposal.title || `fix(ops): ${cluster.name} on ${cluster.path}`).slice(0, 90);
  const body = `<!-- ops-cluster-key: ${cluster.clusterKey} -->

## Error
- **Name:** ${cluster.name}
- **Path:** \`${cluster.path}\`
- **Count:** ${cluster.count}
- **Last seen:** ${cluster.lastSeenAt}
- **Message:** ${cluster.message}

## Change
${proposal.rationale || "Smallest safe code fix for this cluster."}

Files:
${patched.map((file) => `- \`${file.path}\``).join("\n")}

## Verify
${proposal.verify || "Reproduce the failing request and confirm the 500 is gone."}

System Ops will not open another PR for this fingerprint while this PR is open.
After you merge, if the same error returns it is treated as new and can be fixed again.
`;

  await createBranch(repo, branch);
  await putFilesOnBranch({
    repo,
    branch,
    message: title,
    files: patched,
  });
  const pull = await createOpsPull({ repo, branch, title, body });
  return {
    pull,
    record: recordFromCluster(cluster, "open_pr", {
      rationale: proposal.rationale,
      prUrl: pull.url,
      prNumber: pull.number,
      branch,
    }),
  };
}

export async function runErrorFixer(): Promise<FixRunResult> {
  const started = Date.now();
  const planned = await planErrorFixes();
  let ledger = planned.ledger;
  const now = new Date().toISOString();
  if (ledger.runningUntil && Date.parse(ledger.runningUntil) > Date.now()) {
    return {
      ok: true,
      detail: "A fix run is already in progress.",
      newCount: planned.clusters.filter((c) => c.decision === "act").length,
      handledCount: planned.clusters.filter((c) => c.decision === "skip").length,
      opened: 0,
      skipped: planned.clusters.length,
      failed: 0,
      clusters: planned.clusters.map((c) => ({
        clusterKey: c.clusterKey,
        name: c.name,
        path: c.path,
        klass: c.klass,
        decision: c.decision,
        status: c.record?.status,
        reason: "Locked by an in-flight run.",
        prUrl: c.openPull?.url || c.record?.prUrl,
        prNumber: c.openPull?.number || c.record?.prNumber,
      })),
      prs: [],
    };
  }

  ledger.runningUntil = new Date(Date.now() + RUN_LOCK_MS).toISOString();
  await saveErrorFixLedger(ledger);

  const todo = planned.clusters.filter((c) => c.decision === "act").slice(0, MAX_ACT);
  const handled = planned.clusters.filter((c) => c.decision === "skip");
  const results: FixRunResult["clusters"] = handled.map((c) => ({
    clusterKey: c.clusterKey,
    name: c.name,
    path: c.path,
    klass: c.klass,
    decision: c.decision,
    status: c.record?.status,
    reason: c.reason,
    prUrl: c.openPull?.url || c.record?.prUrl,
    prNumber: c.openPull?.number || c.record?.prNumber,
  }));

  let repo: GitHubRepo | null = null;
  if (githubConfigured()) {
    try {
      repo = await getGitHubRepo();
    } catch (err) {
      repo = null;
      results.push({
        clusterKey: "repo",
        name: "GitHub",
        path: "/",
        klass: "config",
        decision: "skip",
        status: "blocked_no_github",
        reason: err instanceof Error ? err.message : "GitHub repo lookup failed",
      });
    }
  }

  const prs: FixRunResult["prs"] = [];
  let opened = 0;
  let skipped = handled.length;
  let failed = 0;

  try {
    for (const cluster of todo) {
      try {
        const already = await findOpenPullForCluster(cluster.clusterKey, planned.openPulls);
        if (already) {
          skipped += 1;
          const record = recordFromCluster(cluster, "open_pr", {
            prUrl: already.url,
            prNumber: already.number,
            branch: already.branch,
            rationale: `Matched existing open PR #${already.number}.`,
          });
          ledger = upsertFixRecord(ledger, record);
          results.push({
            clusterKey: cluster.clusterKey,
            name: cluster.name,
            path: cluster.path,
            klass: cluster.klass,
            decision: "skip",
            status: "open_pr",
            reason: record.rationale || cluster.reason,
            prUrl: already.url,
            prNumber: already.number,
          });
          continue;
        }

        const { record, pull } = await fixOne(cluster, repo);
        ledger = upsertFixRecord(ledger, record);
        if (pull) {
          opened += 1;
          prs.push({ number: pull.number, title: pull.title, url: pull.url });
        } else if (record.status === "failed" || record.status === "blocked_no_github") {
          failed += 1;
        } else {
          skipped += 1;
        }
        results.push({
          clusterKey: cluster.clusterKey,
          name: cluster.name,
          path: cluster.path,
          klass: cluster.klass,
          decision: "act",
          status: record.status,
          reason: record.rationale || cluster.reason,
          prUrl: record.prUrl,
          prNumber: record.prNumber,
        });
      } catch (err) {
        failed += 1;
        const record = recordFromCluster(cluster, "failed", {
          rationale: err instanceof Error ? err.message : "Fix attempt failed",
        });
        ledger = upsertFixRecord(ledger, record);
        results.push({
          clusterKey: cluster.clusterKey,
          name: cluster.name,
          path: cluster.path,
          klass: cluster.klass,
          decision: "act",
          status: "failed",
          reason: record.rationale || "failed",
        });
      }
    }

    const untouched = planned.clusters.length - handled.length - todo.length;
    if (untouched > 0) skipped += untouched;

    const detailParts = [
      opened ? `Opened ${opened} PR${opened === 1 ? "" : "s"}` : "No new PRs",
      `${handled.length} already handled`,
      skipped - handled.length > 0 ? `${skipped - handled.length} skipped` : null,
      failed ? `${failed} failed` : null,
    ].filter(Boolean);
    const lastRun: ErrorFixLastRun = {
      at: now,
      detail: `${detailParts.join(" · ")} (${Date.now() - started}ms)`,
      opened,
      skipped,
      failed,
      prs,
    };
    ledger.lastRun = lastRun;
    ledger.runningUntil = undefined;
    await saveErrorFixLedger(ledger);

    return {
      ok: failed === 0 || opened > 0,
      detail: lastRun.detail,
      newCount: todo.length,
      handledCount: handled.length,
      opened,
      skipped,
      failed,
      clusters: results,
      prs,
    };
  } catch (err) {
    ledger.runningUntil = undefined;
    await saveErrorFixLedger(ledger).catch(() => undefined);
    throw err;
  }
}
