/**
 * Assemble a recruiter Agent Ops snapshot from existing ATS stores.
 * @serverOnly
 */

import { listJobsForUser } from "@/lib/db/repositories/list-builder-repository";
import { listFillJobRunsForUser } from "@/lib/db/repositories/fill-job-run-repository";
import { listRecruiterRuns } from "@/lib/db/repositories/recruiter-run-repository";
import { listGoalRunsForUser } from "@/lib/db/repositories/agent-goal-run-repository";
import {
  listEnrollments,
  listSequences,
} from "@/lib/db/repositories/sequence-repository";
import type { ListBuilderJob } from "@/lib/schemas/list-builder";
import type { RecruiterRun } from "@/lib/schemas/recruiter-run";
import type { FillJobRun } from "@/lib/db/repositories/fill-job-run-repository";
import type { AgentRunSnapshot } from "@/lib/ai/agent-run-types";
import type { SequenceEnrollment } from "@/lib/schemas/sequence";
import type {
  AgentOpsBot,
  AgentOpsBotState,
  AgentOpsHistoryItem,
  AgentOpsIntervention,
  AgentOpsSummary,
} from "./types";

const AI_DESK = "/dashboard/general-ai-usage";
const SEQUENCES = "/dashboard/sequences";

const MINUTES = {
  listJobBase: 10,
  listRow: 2,
  fillBase: 8,
  fillPerson: 1.5,
  sequenceSend: 2,
};

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function greetingName(email?: string): string {
  const local = (email || "").split("@")[0] || "";
  const token = local.split(/[._+\-]/)[0] || "";
  if (token.length >= 2 && /^[a-zA-Z]+$/.test(token)) {
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }
  return "there";
}

function ageLabel(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < 86_400_000) return `${Math.max(1, Math.round(ms / 3_600_000))}h`;
  return `${Math.max(1, Math.round(ms / 86_400_000))}d`;
}

function withinMs(iso: string | undefined, now: number, windowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t <= windowMs && now - t >= -60_000;
}

function pct(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

function formatHours(minutes: number): string {
  if (minutes < 1) return "0 hrs";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)} hrs`;
}

function latestAt(...values: Array<string | undefined>): string | undefined {
  const times = values
    .map((v) => (v ? Date.parse(v) : NaN))
    .filter((n) => Number.isFinite(n)) as number[];
  if (times.length === 0) return undefined;
  return new Date(Math.max(...times)).toISOString();
}

export async function buildAgentOpsSummary(input: {
  tenantId: string;
  userId: string;
  email?: string;
}): Promise<AgentOpsSummary> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  const [listJobs, fillRuns, recruiterRuns, goalRuns, enrollments, sequences] =
    await Promise.all([
      safe(listJobsForUser(input.tenantId, input.userId, { includeResults: false }), [] as ListBuilderJob[]),
      safe(listFillJobRunsForUser(input.tenantId, input.userId), [] as FillJobRun[]),
      safe(listRecruiterRuns(input.tenantId, input.userId), [] as RecruiterRun[]),
      safe(listGoalRunsForUser(input.tenantId, input.userId), [] as AgentRunSnapshot[]),
      safe(listEnrollments(input.tenantId), [] as SequenceEnrollment[]),
      safe(listSequences(input.tenantId), [] as Array<{ id: string; name: string }>),
    ]);

  const sequenceName = new Map(sequences.map((s) => [s.id, s.name]));
  const nameForSeq = (id: string) => sequenceName.get(id) || "Sequence";

  const liveList = listJobs.filter((j) =>
    ["queued", "running", "paused"].includes(j.status)
  );
  const importReady = listJobs.filter((j) => j.status === "awaiting_import");
  const failedList = listJobs.filter((j) => j.status === "failed");
  const completedList24h = listJobs.filter(
    (j) =>
      (j.status === "completed" || j.status === "awaiting_import") &&
      withinMs(j.completedAt || j.updatedAt, now, dayMs)
  );
  const completedList7d = listJobs.filter(
    (j) =>
      (j.status === "completed" || j.status === "awaiting_import") &&
      withinMs(j.completedAt || j.updatedAt, now, weekMs)
  );

  const liveRecruiter = recruiterRuns.filter((r) =>
    ["queued", "running"].includes(r.status)
  );
  const pausedRecruiter = recruiterRuns.filter((r) => r.status === "paused");
  const failedRecruiter = recruiterRuns.filter((r) => r.status === "failed");
  const completedRecruiter24h = recruiterRuns.filter(
    (r) => r.status === "completed" && withinMs(r.completedAt || r.updatedAt, now, dayMs)
  );
  const completedRecruiter7d = recruiterRuns.filter(
    (r) => r.status === "completed" && withinMs(r.completedAt || r.updatedAt, now, weekMs)
  );

  const fill24h = fillRuns.filter((r) => withinMs(r.createdAt || r.updatedAt, now, dayMs));
  const fill7d = fillRuns.filter((r) => withinMs(r.createdAt || r.updatedAt, now, weekMs));
  const fillErrors = fillRuns.filter((r) => Boolean(r.error));

  const liveGoals = goalRuns.filter((g) =>
    ["running", "planning"].includes(g.status)
  );
  const approvalGoals = goalRuns.filter(
    (g) => g.status === "awaiting_approval" || g.status === "paused"
  );
  const failedGoals = goalRuns.filter((g) => g.status === "failed");
  const completedGoals24h = goalRuns.filter(
    (g) => g.status === "completed" && withinMs(g.updatedAt, now, dayMs)
  );

  const activeEnroll = enrollments.filter((e) => e.status === "active");
  const pausedEnroll = enrollments.filter((e) => e.status === "paused");
  const dueEnroll = activeEnroll.filter((e) => {
    const t = Date.parse(e.nextRunAt);
    return Number.isFinite(t) && t <= now;
  });
  const sent24h = enrollments.filter((e) => withinMs(e.lastSentAt, now, dayMs));
  const sent7d = enrollments.filter((e) => withinMs(e.lastSentAt, now, weekMs));

  const people24h =
    completedRecruiter24h.reduce((n, r) => n + (r.qualifiedCount || 0), 0) +
    fill24h.reduce((n, r) => n + (r.count || 0), 0);
  const people7d =
    completedRecruiter7d.reduce((n, r) => n + (r.qualifiedCount || 0), 0) +
    fill7d.reduce((n, r) => n + (r.count || 0), 0);
  const companies24h = completedList24h.reduce(
    (n, j) => n + (j.progress?.found || 0),
    0
  );
  const companies7d = completedList7d.reduce(
    (n, j) => n + (j.progress?.found || 0),
    0
  );

  const units24h =
    completedList24h.length +
    completedRecruiter24h.length +
    fill24h.length +
    completedGoals24h.length +
    sent24h.length;

  const minutes24h =
    completedList24h.reduce(
      (n, j) => n + MINUTES.listJobBase + (j.progress?.found || 0) * MINUTES.listRow,
      0
    ) +
    completedRecruiter24h.reduce(
      (n, r) => n + MINUTES.fillBase + (r.qualifiedCount || 0) * MINUTES.fillPerson,
      0
    ) +
    fill24h.reduce(
      (n, r) => n + MINUTES.fillBase + (r.count || 0) * MINUTES.fillPerson,
      0
    ) +
    sent24h.length * MINUTES.sequenceSend;

  const minutes7d =
    completedList7d.reduce(
      (n, j) => n + MINUTES.listJobBase + (j.progress?.found || 0) * MINUTES.listRow,
      0
    ) +
    completedRecruiter7d.reduce(
      (n, r) => n + MINUTES.fillBase + (r.qualifiedCount || 0) * MINUTES.fillPerson,
      0
    ) +
    fill7d.reduce(
      (n, r) => n + MINUTES.fillBase + (r.count || 0) * MINUTES.fillPerson,
      0
    ) +
    sent7d.length * MINUTES.sequenceSend;

  const fillBot = buildFillReqBot({
    liveRecruiter,
    pausedRecruiter,
    failedRecruiter,
    liveGoals,
    approvalGoals,
    fillRuns,
    recruiterRuns,
  });

  const listBot = buildListBuilderBot({ liveList, importReady, failedList, listJobs });

  const outreachBot = buildOutreachBot({
    dueEnroll,
    activeEnroll,
    pausedEnroll,
    sent24h,
  });

  const bots = [fillBot, listBot, outreachBot];
  const liveCount = bots.filter(
    (b) => b.state === "running" || b.state === "queued"
  ).length;

  const interventions: AgentOpsIntervention[] = [];

  for (const run of liveRecruiter.filter((r) => r.status === "queued")) {
    interventions.push({
      id: `rq-${run.id}`,
      botId: "fill-req",
      title: "Fill req waiting to start",
      detail: truncate(run.query || run.lastMessage || "Queued sourcing run"),
      href: AI_DESK,
      priority: "medium",
      ageLabel: ageLabel(run.updatedAt, now),
      at: run.updatedAt,
    });
  }
  for (const run of pausedRecruiter) {
    interventions.push({
      id: `rp-${run.id}`,
      botId: "fill-req",
      title: "Fill req paused",
      detail: truncate(run.query || run.lastMessage || "Paused sourcing run"),
      href: AI_DESK,
      priority: "medium",
      ageLabel: ageLabel(run.updatedAt, now),
      at: run.updatedAt,
    });
  }
  for (const run of failedRecruiter.slice(0, 4)) {
    interventions.push({
      id: `rf-${run.id}`,
      botId: "fill-req",
      title: "Fill req failed",
      detail: truncate(run.error || run.query || "Sourcing run failed"),
      href: AI_DESK,
      priority: "high",
      ageLabel: ageLabel(run.updatedAt, now),
      at: run.updatedAt,
    });
  }
  for (const run of fillErrors.slice(0, 3)) {
    interventions.push({
      id: `fe-${run.id}`,
      botId: "fill-req",
      title: "Fill snapshot has an error",
      detail: truncate(run.error || run.query),
      href: AI_DESK,
      priority: "medium",
      ageLabel: ageLabel(run.updatedAt || run.createdAt, now),
      at: run.updatedAt || run.createdAt,
    });
  }
  for (const goal of approvalGoals) {
    interventions.push({
      id: `ga-${goal.id}`,
      botId: "fill-req",
      title: "Approve CRM writes",
      detail: truncate(goal.goal || "Goal agent is waiting for confirmation"),
      href: AI_DESK,
      priority: "high",
      ageLabel: ageLabel(goal.updatedAt, now),
      at: goal.updatedAt,
    });
  }
  for (const goal of failedGoals.slice(0, 3)) {
    interventions.push({
      id: `gf-${goal.id}`,
      botId: "fill-req",
      title: "Goal run failed",
      detail: truncate(goal.error || goal.goal || "Goal agent stopped"),
      href: AI_DESK,
      priority: "high",
      ageLabel: ageLabel(goal.updatedAt, now),
      at: goal.updatedAt,
    });
  }
  for (const job of importReady) {
    interventions.push({
      id: `li-${job.id}`,
      botId: "list-builder",
      title: "Import companies found",
      detail: `${job.progress?.found || 0} companies ready · ${truncate(job.brief)}`,
      href: `/dashboard/list-builder/${job.id}`,
      priority: "high",
      ageLabel: ageLabel(job.updatedAt, now),
      at: job.updatedAt,
    });
  }
  for (const job of liveList.filter((j) => j.status === "paused")) {
    interventions.push({
      id: `lp-${job.id}`,
      botId: "list-builder",
      title: "Company list paused",
      detail: truncate(job.progress?.lastMessage || job.brief),
      href: `/dashboard/list-builder/${job.id}`,
      priority: "medium",
      ageLabel: ageLabel(job.updatedAt, now),
      at: job.updatedAt,
    });
  }
  for (const job of failedList.slice(0, 4)) {
    interventions.push({
      id: `lf-${job.id}`,
      botId: "list-builder",
      title: "Company list failed",
      detail: truncate(job.error || job.brief),
      href: `/dashboard/list-builder/${job.id}`,
      priority: "high",
      ageLabel: ageLabel(job.updatedAt, now),
      at: job.updatedAt,
    });
  }
  for (const row of dueEnroll.slice(0, 8)) {
    const overdueMs = now - Date.parse(row.nextRunAt);
    interventions.push({
      id: `sd-${row.id}`,
      botId: "outreach",
      title: "Sequence step is due",
      detail: `${row.candidateName || "Candidate"} · ${nameForSeq(row.sequenceId)}`,
      href: SEQUENCES,
      priority: overdueMs > dayMs ? "high" : "medium",
      ageLabel: ageLabel(row.nextRunAt, now) || "due",
      at: row.nextRunAt,
    });
  }
  for (const row of pausedEnroll.slice(0, 4)) {
    interventions.push({
      id: `sp-${row.id}`,
      botId: "outreach",
      title: "Enrollment paused",
      detail: `${row.candidateName || "Candidate"} · ${nameForSeq(row.sequenceId)}`,
      href: SEQUENCES,
      priority: "medium",
      ageLabel: ageLabel(row.updatedAt, now),
      at: row.updatedAt,
    });
  }

  interventions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return Date.parse(b.at) - Date.parse(a.at);
  });

  const attention = interventions.length;
  const name = greetingName(input.email);

  const completedValue =
    units24h === 1 ? "1 task" : `${units24h} tasks`;
  const attentionValue =
    attention === 1 ? "1 decision" : `${attention} decisions`;

  const briefBody = buildBriefBody({
    name,
    units24h,
    people24h,
    companies24h,
    sent24h: sent24h.length,
    attention,
  });

  const agenda = interventions.slice(0, 5).map((item, index) => ({
    when: index === 0 ? "Now" : item.ageLabel || "Today",
    title: item.title,
    detail: item.detail,
    href: item.href,
    tone: item.priority === "high" ? ("risk" as const) : ("default" as const),
  }));
  if (agenda.length === 0) {
    agenda.push({
      when: "Watch",
      title: "No blocked agent work",
      detail: "Start a fill req, company list, or sequence and it will land here.",
      href: AI_DESK,
      tone: "default",
    });
  }

  const history = buildHistory({
    listJobs,
    fillRuns,
    recruiterRuns,
    goalRuns,
    enrollments,
    nameForSeq,
  });

  return {
    greetingName: name,
    generatedAt: new Date(now).toISOString(),
    liveCount,
    stats: {
      completedValue,
      completedContext:
        units24h > 0
          ? "Fill req, company lists, and outreach in the last 24 hours"
          : "No completed agent work in the last 24 hours",
      savedValue: formatHours(minutes24h),
      savedContext: "Estimated from completed agent work — not billed hours",
      attentionValue,
      attentionContext:
        attention === 0
          ? "Nothing waiting on you"
          : "Approvals, imports, failures, and due sequence steps",
    },
    bots,
    interventions: interventions.slice(0, 20),
    brief: {
      headline: `Good ${daypart(now)}, ${name}`,
      body: briefBody,
      impact: [
        {
          label: "Sourcing",
          detail:
            people7d > 0
              ? `${people7d} people returned by fill req this week`
              : "No fill-req people returned this week",
          value: people7d > 0 ? `${people7d}` : "—",
        },
        {
          label: "BD lists",
          detail:
            companies7d > 0
              ? `${companies7d} companies kept on lists this week`
              : "No company-list results this week",
          value: companies7d > 0 ? `${companies7d}` : "—",
        },
        {
          label: "Capacity",
          detail: "Estimated research and outreach time agents covered",
          value: formatHours(minutes7d),
        },
      ],
      agenda,
    },
    history,
  };
}

function buildFillReqBot(input: {
  liveRecruiter: RecruiterRun[];
  pausedRecruiter: RecruiterRun[];
  failedRecruiter: RecruiterRun[];
  liveGoals: AgentRunSnapshot[];
  approvalGoals: AgentRunSnapshot[];
  fillRuns: FillJobRun[];
  recruiterRuns: RecruiterRun[];
}): AgentOpsBot {
  const running = input.liveRecruiter.find((r) => r.status === "running");
  const queued = input.liveRecruiter.find((r) => r.status === "queued");
  const paused = input.pausedRecruiter[0];
  const goalLive = input.liveGoals[0];
  const goalWait = input.approvalGoals[0];
  const latestFill = input.fillRuns[0];
  const latestRecruiter = input.recruiterRuns[0];

  let state: AgentOpsBotState = "idle";
  let headline = "No fill req running";
  let progressPct: number | null = null;
  let liveCount = 0;
  let lastAt: string | undefined;

  if (running) {
    state = "running";
    liveCount = input.liveRecruiter.length + input.liveGoals.length;
    headline = `Qualifying ${running.qualifiedCount || 0} of ${running.targetQualified || 0} · ${truncate(running.query)}`;
    progressPct = pct(running.qualifiedCount || 0, running.targetQualified || 0);
    lastAt = running.updatedAt;
  } else if (goalLive) {
    state = "running";
    liveCount = input.liveGoals.length + input.liveRecruiter.length;
    headline = truncate(goalLive.goal || "Goal agent running");
    progressPct = pct(goalLive.wave || 0, goalLive.maxWaves || 0);
    lastAt = goalLive.updatedAt;
  } else if (queued) {
    state = "queued";
    liveCount = input.liveRecruiter.length;
    headline = `Queued · ${truncate(queued.query)}`;
    lastAt = queued.updatedAt;
  } else if (paused || goalWait) {
    state = "paused";
    headline = goalWait
      ? "Waiting for CRM write approval"
      : `Paused · ${truncate(paused?.query || "")}`;
    progressPct = 100;
    lastAt = goalWait?.updatedAt || paused?.updatedAt;
  } else if (input.failedRecruiter[0] && isMostRecent(input.failedRecruiter[0].updatedAt, [
    latestFill?.updatedAt,
    latestRecruiter?.updatedAt,
  ])) {
    state = "failed";
    headline = truncate(input.failedRecruiter[0].error || input.failedRecruiter[0].query);
    lastAt = input.failedRecruiter[0].updatedAt;
  } else if (latestRecruiter?.status === "completed") {
    headline = `Last run · ${latestRecruiter.qualifiedCount || 0} people · ${truncate(latestRecruiter.query)}`;
    lastAt = latestRecruiter.updatedAt;
  } else if (latestFill) {
    headline = `Last snapshot · ${latestFill.count || 0} people · ${truncate(latestFill.jobTitle || latestFill.query)}`;
    lastAt = latestFill.updatedAt || latestFill.createdAt;
  }

  return {
    id: "fill-req",
    name: "Fill Req",
    initials: "FR",
    state,
    headline,
    progressPct,
    href: AI_DESK,
    hrefLabel: "Open AI desk",
    liveCount,
    lastAt,
  };
}

function buildListBuilderBot(input: {
  liveList: ListBuilderJob[];
  importReady: ListBuilderJob[];
  failedList: ListBuilderJob[];
  listJobs: ListBuilderJob[];
}): AgentOpsBot {
  const running = input.liveList.find((j) => j.status === "running");
  const queued = input.liveList.find((j) => j.status === "queued");
  const paused = input.liveList.find((j) => j.status === "paused");
  const waiting = input.importReady[0];
  const latest = input.listJobs[0];

  let state: AgentOpsBotState = "idle";
  let headline = "No company list running";
  let progressPct: number | null = null;
  let liveCount = 0;
  let lastAt: string | undefined;
  let href = AI_DESK;

  if (running) {
    state = "running";
    liveCount = input.liveList.filter((j) => j.status === "running").length;
    headline = `${running.progress?.found || 0} of ${running.progress?.target || running.targetSize || 0} · ${truncate(running.brief)}`;
    progressPct = pct(
      running.progress?.found || 0,
      running.progress?.target || running.targetSize || 0
    );
    lastAt = running.updatedAt;
    href = `/dashboard/list-builder/${running.id}`;
  } else if (queued) {
    state = "queued";
    liveCount = input.liveList.length;
    headline = `Queued · ${truncate(queued.brief)}`;
    lastAt = queued.updatedAt;
    href = `/dashboard/list-builder/${queued.id}`;
  } else if (paused) {
    state = "paused";
    headline = `Paused · ${paused.progress?.found || 0} found · ${truncate(paused.brief)}`;
    progressPct = 100;
    lastAt = paused.updatedAt;
    href = `/dashboard/list-builder/${paused.id}`;
  } else if (waiting) {
    state = "paused";
    headline = `Ready to import ${waiting.progress?.found || 0} companies`;
    progressPct = 100;
    lastAt = waiting.updatedAt;
    href = `/dashboard/list-builder/${waiting.id}`;
  } else if (input.failedList[0] && isMostRecent(input.failedList[0].updatedAt, [latest?.updatedAt])) {
    state = "failed";
    headline = truncate(input.failedList[0].error || input.failedList[0].brief);
    lastAt = input.failedList[0].updatedAt;
    href = `/dashboard/list-builder/${input.failedList[0].id}`;
  } else if (latest) {
    headline = `Last list · ${latest.progress?.found || 0} companies · ${truncate(latest.brief)}`;
    lastAt = latest.updatedAt;
    href = `/dashboard/list-builder/${latest.id}`;
  }

  return {
    id: "list-builder",
    name: "List Builder",
    initials: "LB",
    state,
    headline,
    progressPct,
    href,
    hrefLabel: href === AI_DESK ? "Start a list" : "Open list",
    liveCount,
    lastAt,
  };
}

function buildOutreachBot(input: {
  dueEnroll: SequenceEnrollment[];
  activeEnroll: SequenceEnrollment[];
  pausedEnroll: SequenceEnrollment[];
  sent24h: SequenceEnrollment[];
}): AgentOpsBot {
  let state: AgentOpsBotState = "idle";
  let headline = "No active sequences";
  let progressPct: number | null = null;
  let liveCount = 0;
  const lastAt = latestAt(
    ...input.dueEnroll.map((e) => e.updatedAt),
    ...input.activeEnroll.map((e) => e.lastSentAt || e.updatedAt),
    ...input.sent24h.map((e) => e.lastSentAt)
  );

  if (input.dueEnroll.length > 0) {
    state = "running";
    liveCount = input.dueEnroll.length;
    headline = `${input.dueEnroll.length} sequence step${input.dueEnroll.length === 1 ? "" : "s"} due`;
    progressPct = pct(
      input.activeEnroll.length - input.dueEnroll.length,
      input.activeEnroll.length
    );
  } else if (input.pausedEnroll.length > 0 && input.activeEnroll.length === 0) {
    state = "paused";
    headline = `${input.pausedEnroll.length} enrollment${input.pausedEnroll.length === 1 ? "" : "s"} paused`;
    progressPct = 100;
  } else if (input.activeEnroll.length > 0) {
    state = "idle";
    headline = `Watching ${input.activeEnroll.length} active enrollment${input.activeEnroll.length === 1 ? "" : "s"}`;
    if (input.sent24h.length > 0) {
      headline += ` · ${input.sent24h.length} sent in 24h`;
    }
  }

  return {
    id: "outreach",
    name: "Outreach",
    initials: "OR",
    state,
    headline,
    progressPct,
    href: SEQUENCES,
    hrefLabel: "Open sequences",
    liveCount,
    lastAt,
  };
}

function buildHistory(input: {
  listJobs: ListBuilderJob[];
  fillRuns: FillJobRun[];
  recruiterRuns: RecruiterRun[];
  goalRuns: AgentRunSnapshot[];
  enrollments: SequenceEnrollment[];
  nameForSeq: (id: string) => string;
}): AgentOpsHistoryItem[] {
  const items: AgentOpsHistoryItem[] = [];

  for (const job of input.listJobs.slice(0, 10)) {
    items.push({
      id: `h-lb-${job.id}`,
      botId: "list-builder",
      title: `${statusVerb(job.status)} company list`,
      detail: `${job.progress?.found || 0} found · ${truncate(job.brief)}`,
      href: `/dashboard/list-builder/${job.id}`,
      at: job.updatedAt,
    });
  }
  for (const run of input.recruiterRuns.slice(0, 10)) {
    items.push({
      id: `h-rr-${run.id}`,
      botId: "fill-req",
      title: `${statusVerb(run.status)} fill req`,
      detail: `${run.qualifiedCount || 0} qualified · ${truncate(run.query)}`,
      href: AI_DESK,
      at: run.updatedAt,
    });
  }
  for (const run of input.fillRuns.slice(0, 8)) {
    items.push({
      id: `h-fr-${run.id}`,
      botId: "fill-req",
      title: run.error ? "Fill snapshot error" : "Fill snapshot saved",
      detail: `${run.count || 0} people · ${truncate(run.jobTitle || run.query)}`,
      href: AI_DESK,
      at: run.updatedAt || run.createdAt,
    });
  }
  for (const goal of input.goalRuns.slice(0, 8)) {
    items.push({
      id: `h-g-${goal.id}`,
      botId: "fill-req",
      title: `${statusVerb(goal.status)} goal run`,
      detail: truncate(goal.goal),
      href: AI_DESK,
      at: goal.updatedAt,
    });
  }
  for (const row of input.enrollments.slice(0, 10)) {
    const when = row.lastSentAt || row.updatedAt;
    items.push({
      id: `h-or-${row.id}`,
      botId: "outreach",
      title: row.lastSentAt ? "Sequence step sent" : `${statusVerb(row.status)} enrollment`,
      detail: `${row.candidateName || "Candidate"} · ${input.nameForSeq(row.sequenceId)}`,
      href: SEQUENCES,
      at: when,
    });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const seen = new Set<string>();
  const unique: AgentOpsHistoryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= 24) break;
  }
  return unique;
}

function buildBriefBody(input: {
  name: string;
  units24h: number;
  people24h: number;
  companies24h: number;
  sent24h: number;
  attention: number;
}): string {
  const bits: string[] = [];
  if (input.units24h === 0) {
    bits.push(
      "No agent work finished in the last day. Start a fill req, company list, or sequence from the existing desks — this board fills in as they run."
    );
  } else {
    bits.push(
      `Agents finished ${input.units24h} task${input.units24h === 1 ? "" : "s"} in the last 24 hours.`
    );
    if (input.people24h > 0) bits.push(`${input.people24h} people came back from fill req.`);
    if (input.companies24h > 0) bits.push(`${input.companies24h} companies landed on lists.`);
    if (input.sent24h > 0) bits.push(`${input.sent24h} sequence step${input.sent24h === 1 ? "" : "s"} sent.`);
  }
  if (input.attention > 0) {
    bits.push(
      `${input.attention} item${input.attention === 1 ? "" : "s"} need your call before work can continue.`
    );
  } else if (input.units24h > 0) {
    bits.push("Nothing is blocked.");
  }
  return bits.join(" ");
}

function statusVerb(status: string): string {
  const map: Record<string, string> = {
    running: "Running",
    queued: "Queued",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    awaiting_import: "Ready to import",
    awaiting_approval: "Waiting on approval",
    planning: "Planning",
    active: "Active",
    stopped: "Stopped",
    rejected: "Rejected",
  };
  return map[status] || status.replace(/_/g, " ");
}

function truncate(value: string, max = 72): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Untitled";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function isMostRecent(candidate: string | undefined, others: Array<string | undefined>): boolean {
  const c = candidate ? Date.parse(candidate) : NaN;
  if (!Number.isFinite(c)) return false;
  return others.every((iso) => {
    if (!iso) return true;
    const t = Date.parse(iso);
    return !Number.isFinite(t) || t <= c;
  });
}

function daypart(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}


