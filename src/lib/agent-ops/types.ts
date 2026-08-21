/**
 * Recruiter-facing Agent Ops dashboard.
 * Separate from /dashboard/ai-agents (platform switches) and the AI desk.
 */

export const AGENT_OPS_TABS = [
  "active",
  "command",
  "launch",
  "fleet",
  "queue",
  "brief",
  "history",
] as const;

export type AgentOpsTab = (typeof AGENT_OPS_TABS)[number];

export type AgentOpsBotId = "fill-req" | "list-builder" | "outreach";

export type AgentOpsBotState =
  | "running"
  | "queued"
  | "paused"
  | "idle"
  | "failed";

export type AgentOpsBot = {
  id: AgentOpsBotId;
  name: string;
  initials: string;
  state: AgentOpsBotState;
  headline: string;
  progressPct: number | null;
  href: string;
  hrefLabel: string;
  liveCount: number;
  lastAt?: string;
};

export type AgentOpsActiveRun = {
  id: string;
  botId: AgentOpsBotId;
  agentName: string;
  title: string;
  detail: string;
  status: "queued" | "running";
  progressPct: number | null;
  progressLabel?: string;
  href: string;
  hrefLabel?: string;
  updatedAt: string;
};

export type AgentOpsIntervention = {
  id: string;
  botId: AgentOpsBotId;
  title: string;
  detail: string;
  href: string;
  priority: "high" | "medium";
  ageLabel: string;
  at: string;
};

export type AgentOpsImpactRow = {
  label: string;
  detail: string;
  value: string;
};

export type AgentOpsAgendaItem = {
  when: string;
  title: string;
  detail: string;
  href?: string;
  tone?: "risk" | "default";
};

export type AgentOpsHistoryItem = {
  id: string;
  botId: AgentOpsBotId;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
  at: string;
};

export type AgentOpsSummary = {
  greetingName: string;
  generatedAt: string;
  liveCount: number;
  stats: {
    completedValue: string;
    completedContext: string;
    savedValue: string;
    savedContext: string;
    attentionValue: string;
    attentionContext: string;
  };
  activeRuns: AgentOpsActiveRun[];
  bots: AgentOpsBot[];
  interventions: AgentOpsIntervention[];
  brief: {
    headline: string;
    body: string;
    impact: AgentOpsImpactRow[];
    agenda: AgentOpsAgendaItem[];
  };
  history: AgentOpsHistoryItem[];
};

export function isAgentOpsTab(value: string | null | undefined): value is AgentOpsTab {
  return (
    value === "active" ||
    value === "command" ||
    value === "launch" ||
    value === "fleet" ||
    value === "queue" ||
    value === "brief" ||
    value === "history"
  );
}
