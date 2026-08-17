/**
 * Platform-wide scheduled-agent switches. Default OFF so Vercel crons
 * stay installed but do not process work until a System Admin enables them.
 * @serverOnly
 */

import { getItem, putItem, tableNames } from "@/lib/db/dynamodb";

export const PLATFORM_AGENTS = [
  {
    id: "system-ops",
    label: "System ops",
    kind: "task" as const,
    schedule: "On demand",
    path: "",
    href: "/dashboard/performance",
    hrefLabel: "Ops Health",
    summary:
      "Reads live errors, skips clusters already handled, opens a GitHub PR with a code patch for new bugs, and can merge each PR to production from this screen.",
    impact:
      "Does not send email or source candidates. Code fixes go through GitHub PRs — never by editing the live Vercel filesystem. Merge deploys via the existing Git → Vercel production pipeline.",
    capabilities: [
      "Fingerprint errors and skip already-handled clusters",
      "Open a GitHub PR with a code patch for new code errors",
      "Merge each fix PR to production from this screen",
      "Classify config/infra so we do not write useless code",
    ],
    cost: {
      perRunUsd: 0.08,
      idleTickUsd: 0,
      dayIfBusyUsd: 0,
      monthIfBusyUsd: 0,
      note: "LLM spend only when drafting a code PR. GitHub API is free. Merge is free.",
    },
    tasks: [
      {
        id: "fix-errors",
        label: "Fix new errors in GitHub",
        detail:
          "Walks new error clusters, drafts a code patch, and opens a PR. Skips clusters that already have an open PR or were classified as config/infra.",
      },
      {
        id: "health-digest",
        label: "Health digest",
        detail: "Reads current errors, queues, and cron state. Does not change data.",
      },
      {
        id: "clean-errors",
        label: "Clean recorded errors",
        detail:
          "Clears clustered first-party error records on Ops Health. Does not erase the handled-vs-new ledger.",
      },
      {
        id: "prune-samples",
        label: "Prune performance samples",
        detail: "Clears recent API timing samples used by the Ops Health chart.",
      },
    ],
  },
  {
    id: "recruiter-agent-run",
    label: "Recruiter agent",
    kind: "cron" as const,
    schedule: "Every minute",
    path: "/api/cron/recruiter-agent-run",
    href: "/dashboard/general-ai-usage",
    hrefLabel: "Open AI desk",
    summary:
      "Advances queued recruiter sourcing runs (Apollo / web search) across tenants.",
    impact:
      "When on, queued Fill Req / recruiter runs keep working in the background.",
    capabilities: [
      "Process queued sourcing runs",
      "Call Apollo / web search",
      "Write candidate results onto the run",
    ],
    cost: {
      perRunUsd: 0.12,
      idleTickUsd: 0,
      dayIfBusyUsd: 2.4,
      monthIfBusyUsd: 50,
      note: "Idle ticks are free. Spend happens only when a run is queued.",
    },
    tasks: [],
  },
  {
    id: "list-builder-run",
    label: "List builder",
    kind: "cron" as const,
    schedule: "Every 5 minutes",
    path: "/api/cron/list-builder-run",
    href: "/dashboard/general-ai-usage",
    hrefLabel: "Open AI desk",
    summary: "Advances active list-builder jobs that are queued or running.",
    impact: "When on, list-builder jobs continue without someone watching the desk.",
    capabilities: [
      "Advance queued list-builder jobs",
      "Fetch public pages and extract contacts",
    ],
    cost: {
      perRunUsd: 0.04,
      idleTickUsd: 0,
      dayIfBusyUsd: 0.8,
      monthIfBusyUsd: 16,
      note: "Idle ticks are free. Cost is search/fetch when a job is active.",
    },
    tasks: [],
  },
  {
    id: "sequences-run",
    label: "Sequences",
    kind: "cron" as const,
    schedule: "Hourly",
    path: "/api/cron/sequences-run",
    href: "/dashboard/sequences",
    hrefLabel: "Open Sequences",
    summary: "Sends due sequence steps (email / tasks) for enrolled candidates.",
    impact: "When on, outreach sequences send on their schedule.",
    capabilities: [
      "Send due sequence emails",
      "Create follow-up tasks",
    ],
    cost: {
      perRunUsd: 0,
      idleTickUsd: 0,
      dayIfBusyUsd: 0,
      monthIfBusyUsd: 0,
      note: "No LLM cost. Email is sent through the recruiter's connected mailbox.",
    },
    tasks: [],
  },
  {
    id: "sequences-poll-replies",
    label: "Sequence replies",
    kind: "cron" as const,
    schedule: "Hourly at :30",
    path: "/api/cron/sequences-poll-replies",
    href: "/dashboard/sequences",
    hrefLabel: "Open Sequences",
    summary: "Polls connected inboxes for replies to sequence emails.",
    impact: "When on, replies are detected and enrollments can stop or branch.",
    capabilities: ["Poll Gmail / Outlook for sequence replies"],
    cost: {
      perRunUsd: 0,
      idleTickUsd: 0,
      dayIfBusyUsd: 0,
      monthIfBusyUsd: 0,
      note: "Mailbox API only — no LLM or Apollo spend.",
    },
    tasks: [],
  },
] as const;

export type PlatformAgentId = (typeof PLATFORM_AGENTS)[number]["id"];

export type AgentSwitch = {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export type PlatformAgentControls = {
  id: "platform-agent-controls";
  type: "platform_agent_controls";
  agents: Record<string, AgentSwitch>;
  updatedAt: string;
};

const DOC_ID = "platform-agent-controls";

function emptyControls(): PlatformAgentControls {
  return {
    id: DOC_ID,
    type: "platform_agent_controls",
    agents: Object.fromEntries(
      PLATFORM_AGENTS.filter((agent) => agent.kind === "cron").map((agent) => [
        agent.id,
        { enabled: false },
      ])
    ),
    updatedAt: new Date().toISOString(),
  };
}

export async function getPlatformAgentControls(): Promise<PlatformAgentControls> {
  try {
    const doc = await getItem<PlatformAgentControls>(tableNames.profiles, {
      id: DOC_ID,
    });
    if (!doc || doc.type !== "platform_agent_controls") return emptyControls();
    const agents = { ...emptyControls().agents, ...(doc.agents || {}) };
    return { ...doc, id: DOC_ID, type: "platform_agent_controls", agents };
  } catch {
    return emptyControls();
  }
}

export async function isAgentScheduleEnabled(
  agentId: PlatformAgentId
): Promise<boolean> {
  const meta = PLATFORM_AGENTS.find((agent) => agent.id === agentId);
  if (meta?.kind !== "cron") return false;
  const controls = await getPlatformAgentControls();
  return controls.agents[agentId]?.enabled === true;
}

export async function setAgentScheduleEnabled(
  agentId: PlatformAgentId,
  enabled: boolean,
  updatedBy?: string
): Promise<PlatformAgentControls> {
  const meta = PLATFORM_AGENTS.find((agent) => agent.id === agentId);
  if (meta?.kind !== "cron") {
    return getPlatformAgentControls();
  }
  const current = await getPlatformAgentControls();
  const now = new Date().toISOString();
  current.agents[agentId] = { enabled, updatedAt: now, updatedBy };
  current.updatedAt = now;
  await putItem(tableNames.profiles, current);
  return current;
}
