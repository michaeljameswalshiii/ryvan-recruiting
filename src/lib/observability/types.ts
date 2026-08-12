export type OpsRange = "1h" | "6h" | "24h" | "7d";
export type OpsStatus = "healthy" | "degraded" | "incident";
export type OpsEventKind =
  | "api"
  | "nav"
  | "vital"
  | "js_error"
  | "server_error";

export type OpsInsightSeverity = "ok" | "info" | "warn" | "critical";

export type IngestEvent = {
  kind: OpsEventKind;
  path?: string;
  status?: number;
  ms?: number;
  name?: string;
  message?: string;
  value?: number;
};

export type StoredEvent = {
  t: string;
  kind: OpsEventKind;
  path: string;
  status?: number;
  ms?: number;
  name?: string;
  message?: string;
};

export type StoredError = {
  t: string;
  source: "browser" | "server";
  path: string;
  name: string;
  message: string;
  status?: number;
  count?: number;
};

export type HourBucket = {
  id: string;
  type: "ops_hour";
  hour: string;
  requests: number;
  errors: number;
  clientErrors: number;
  serverErrors: number;
  slow: number;
  totalMs: number;
  navCount: number;
  navTotalMs: number;
  lcpCount: number;
  lcpTotal: number;
  updatedAt: string;
};

export type CronHeartbeat = {
  id: string;
  type: "ops_cron";
  cronId: string;
  label: string;
  schedule: string;
  path: string;
  status: "ok" | "error";
  lastRunAt: string;
  durationMs: number;
  detail?: string;
};

export type RouteStat = {
  path: string;
  count: number;
  errors: number;
  slow: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
};

export type OpsInsight = {
  severity: OpsInsightSeverity;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
};

export type DependencyHealth = {
  id: string;
  label: string;
  status: OpsStatus;
  detail: string;
  latencyMs?: number;
};

export type JobHealth = {
  id: string;
  label: string;
  schedule: string;
  status: OpsStatus | "unknown";
  lastRunAt?: string;
  durationMs?: number;
  detail?: string;
  stale?: boolean;
};

export type SeriesPoint = {
  t: string;
  label: string;
  requests: number;
  errors: number;
  avgMs: number;
};

export type VercelLinks = {
  logs: string;
  errorLogs: string;
  observability: string;
  speedInsights: string;
  deployments: string;
  runtime: string;
};

export type VercelSnapshot = {
  configured: boolean;
  error?: string;
  links: VercelLinks;
  deployment?: {
    id?: string;
    url?: string;
    state?: string;
    createdAt?: string;
    commit?: string;
    commitMessage?: string;
    inspectorUrl?: string;
  };
  errorClusters: Array<{
    name: string;
    count: number;
    path?: string;
    lastSeen?: string;
    sample?: string;
    href: string;
  }>;
  recentLogs: Array<{
    t: string;
    level: string;
    path: string;
    status?: number;
    message: string;
    href: string;
  }>;
  statusBreakdown: Array<{ status: string; count: number }>;
};

export type OpsOverview = {
  generatedAt: string;
  range: OpsRange;
  scope: "all" | string;
  status: OpsStatus;
  statusReason: string;
  kpis: {
    requests: number;
    errors: number;
    errorRate: number;
    slow: number;
    avgMs: number;
    p95Ms: number;
    navAvgMs: number;
    lcpAvgMs: number;
    sampleSize: number;
  };
  series: SeriesPoint[];
  insights: OpsInsight[];
  routes: RouteStat[];
  errors: StoredError[];
  dependencies: DependencyHealth[];
  jobs: JobHealth[];
  vercel: VercelSnapshot;
  sources: {
    firstParty: boolean;
    vercel: boolean;
    note: string;
  };
};
