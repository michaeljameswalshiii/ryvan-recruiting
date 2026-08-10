"use client";

/**
 * Admin — Login audit log
 * Shows sign-in attempts: email, day/time, result, credential type, IP.
 * Passwords are never logged or displayed.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  LogOut,
  Shield,
  Search,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type LoginRow = {
  id: string;
  createdAt: string;
  email: string;
  actorEmail?: string;
  role: string;
  action: string;
  result: "success" | "failure" | "logout" | "mfa" | "other";
  credentialType: string;
  summary: string;
  ip: string;
  userAgent: string;
  approximate?: boolean;
  tenantId?: string;
};

function formatWhen(iso: string) {
  if (!iso) return { day: "—", time: "—" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso, time: "" };
  return {
    day: d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function ResultBadge({ result }: { result: LoginRow["result"] }) {
  if (result === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Success
      </span>
    );
  }
  if (result === "failure") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-red-200">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  if (result === "logout") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
        <LogOut className="h-3 w-3" />
        Logout
      </span>
    );
  }
  if (result === "mfa") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-200">
        <Shield className="h-3 w-3" />
        MFA
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
      Other
    </span>
  );
}

function shortUa(ua: string) {
  if (!ua || ua === "—") return "—";
  if (ua.length <= 40) return ua;
  return ua.slice(0, 40) + "…";
}

function displayEmail(row: LoginRow): string {
  const e = String(row.email || row.actorEmail || "").trim();
  if (e && e !== "—" && e.includes("@")) return e;
  return "—";
}

export default function LoginAuditPage() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailFilter, setEmailFilter] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"tenant" | "all_tenants">("tenant");

  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (email?: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (email?.trim()) params.set("email", email.trim());
      const res = await fetch(`/api/tenant/login-audit?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 409
            ? "Select a tenant, or wait for the platform audit fix to deploy"
            : `Failed to load (${res.status})`);
        throw new Error(msg);
      }
      setRows(Array.isArray(data.events) ? data.events : []);
      setScope(data.scope === "all_tenants" ? "all_tenants" : "tenant");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load login audit";
      setLoadError(msg);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQuery(emailFilter.trim());
    void load(emailFilter);
  };

  const showTenant = scope === "all_tenants";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <ScrollText className="h-7 w-7 text-blue-600" />
            Login audit
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Each row shows the user&apos;s <strong>email address</strong>, day
            and time, and success/fail. Passwords are never stored.
            {showTenant ? (
              <span className="mt-1 block text-violet-700 dark:text-violet-300">
                Site Admin view — all tenants.
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(query)}
          disabled={loading}
          className="border-slate-300 bg-white text-slate-900"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        data-ink-on-light
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder="Filter by email address…"
            className="bg-white pl-9 text-slate-900"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          Search
        </Button>
        {query ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEmailFilter("");
              setQuery("");
              void load();
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <div
        data-ink-on-light
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading login history…
          </div>
        ) : loadError ? (
          <div className="px-6 py-16 text-center text-sm text-red-700">
            <p className="font-semibold">Could not load login audit</p>
            <p className="mt-2 text-red-600">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void load(query)}
            >
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-600">
            No login events yet. Successful and failed sign-ins will appear here
            automatically with the email used at sign-in.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      Email address
                    </span>
                  </th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Credentials</th>
                  <th className="px-4 py-3">Role</th>
                  {showTenant ? <th className="px-4 py-3">Tenant</th> : null}
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Browser / device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const { day, time } = formatWhen(row.createdAt);
                  const email = displayEmail(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div
                          className="inline-flex max-w-[280px] items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 font-mono text-[13px] font-semibold text-blue-900 ring-1 ring-blue-100"
                          title={email}
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span className="truncate">{email}</span>
                        </div>
                        {row.approximate ? (
                          <div className="mt-1">
                            <span
                              className="inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200"
                              title="Approx. date from profile history — not a captured live login"
                            >
                              Historical est.
                            </span>
                          </div>
                        ) : null}
                        {row.summary ? (
                          <div
                            className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500"
                            title={row.summary}
                          >
                            {row.summary}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-800">
                        {day}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {time}
                      </td>
                      <td className="px-4 py-3">
                        <ResultBadge result={row.result} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {row.credentialType}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-slate-600">
                        {row.role}
                      </td>
                      {showTenant ? (
                        <td
                          className="max-w-[140px] truncate px-4 py-3 font-mono text-[10px] text-slate-500"
                          title={row.tenantId}
                        >
                          {row.tenantId || "—"}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-600">
                        {row.ip}
                      </td>
                      <td
                        className="max-w-[180px] truncate px-4 py-3 text-[11px] text-slate-500"
                        title={row.userAgent}
                      >
                        {shortUa(row.userAgent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          {rows.length} event{rows.length === 1 ? "" : "s"}
          {query ? ` matching “${query}”` : ""}
          {showTenant ? " · all tenants" : ""} · Email shown for every login ·
          passwords never written
        </div>
      </div>
    </div>
  );
}
