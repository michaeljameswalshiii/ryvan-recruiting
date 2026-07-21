"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Shield,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ToolStat = {
  calls: number;
  successes: number;
  failures: number;
  totalMs: number;
};

type AuditRow = {
  id: string;
  toolName: string;
  success: boolean;
  error?: string;
  durationMs: number;
  resultStatus?: string;
  paramsSummary?: string;
  createdAt: string;
  userId?: string;
};

function pct(successes: number, calls: number): string {
  if (!calls) return "—";
  return `${((successes / calls) * 100).toFixed(1)}%`;
}

function avgMs(totalMs: number, calls: number): string {
  if (!calls) return "—";
  return `${Math.round(totalMs / calls)} ms`;
}

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AiReliabilityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Record<string, ToolStat>>({});
  const [recent, setRecent] = useState<AuditRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/tool-audit");
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setError(data.error || "Failed to load");
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setStats(data.stats || {});
          setRecent(Array.isArray(data.recent) ? data.recent : []);
          setUpdatedAt(data.updatedAt || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = Object.entries(stats).sort(
    (a, b) => (b[1]?.calls || 0) - (a[1]?.calls || 0)
  );
  const totalCalls = rows.reduce((s, [, v]) => s + (v.calls || 0), 0);
  const totalSuccess = rows.reduce((s, [, v]) => s + (v.successes || 0), 0);
  const totalFail = rows.reduce((s, [, v]) => s + (v.failures || 0), 0);
  const failures = recent.filter((r) => !r.success);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-slate-700" />
            AI Reliability
          </h1>
          <p className="text-muted-foreground">
            Tool call success rates, latency, and recent failures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/ai-assistant">
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-slate-50 gap-1"
            >
              AI Assistant
            </Badge>
          </Link>
          <Link href="/dashboard/settings">
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-slate-50 gap-1"
            >
              AI Settings
            </Badge>
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audit data…
        </div>
      )}

      {error && !loading && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Total calls
                </CardDescription>
                <CardTitle className="text-2xl">{totalCalls}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Success rate
                </CardDescription>
                <CardTitle className="text-2xl">
                  {pct(totalSuccess, totalCalls)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Failures
                </CardDescription>
                <CardTitle className="text-2xl">{totalFail}</CardTitle>
              </CardHeader>
              {updatedAt && (
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Stats updated {formatWhen(updatedAt)}
                </CardContent>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Tool stats
              </CardTitle>
              <CardDescription>
                Per-tool call counts, success rate, and average latency
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tool calls recorded yet. Use the AI Assistant to generate
                  audit data.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Tool</th>
                        <th className="px-3 py-2 font-medium">Calls</th>
                        <th className="px-3 py-2 font-medium">Success rate</th>
                        <th className="px-3 py-2 font-medium">Avg latency</th>
                        <th className="px-3 py-2 font-medium">Failures</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map(([name, s]) => (
                        <tr key={name} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {name}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{s.calls}</td>
                          <td className="px-3 py-2 tabular-nums">
                            <span
                              className={
                                s.calls && s.successes / s.calls < 0.9
                                  ? "text-amber-700 font-medium"
                                  : "text-emerald-700"
                              }
                            >
                              {pct(s.successes, s.calls)}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {avgMs(s.totalMs, s.calls)}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">
                            {s.failures || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Recent failures
              </CardTitle>
              <CardDescription>
                Latest failed tool executions (most recent first)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {failures.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No recent failures — looking good.
                </p>
              ) : (
                <ul className="space-y-3">
                  {failures.slice(0, 25).map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-red-100 bg-red-50/40 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {f.toolName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatWhen(f.createdAt)} · {f.durationMs} ms
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-red-800 break-words">
                        {f.error || f.resultStatus || "Unknown error"}
                      </p>
                      {f.paramsSummary && (
                        <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                          {f.paramsSummary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
