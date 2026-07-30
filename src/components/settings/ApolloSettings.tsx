"use client";

/**
 * Tenant-wide Apollo BYOK
 * One key per company — team admins set/remove it; everyone in the tenant uses it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Building2,
  AlertCircle,
  Unlink,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ApolloStatus = {
  hasKey: boolean;
  keyHint?: string;
  providedByUserId?: string;
  providedByEmail?: string;
  updatedAt?: string;
  lastValidatedOk?: boolean;
  hasPlatformKey?: boolean;
  connected?: boolean;
  healthMessage?: string;
  activeSource?: "tenant" | "platform" | "none";
  description?: string;
  canManage?: boolean;
};

export function ApolloSettings() {
  const [status, setStatus] = useState<ApolloStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/apollo", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load Apollo status");
      }
      setStatus(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load Apollo status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = !!status?.canManage;

  const saveKey = async () => {
    if (!canManage) {
      toast.error("Only team admins can set the company Apollo key");
      return;
    }
    if (!keyInput.trim()) {
      toast.error("Paste an Apollo API key first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/apollo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save Apollo key");
        return;
      }
      toast.success(
        data.message ||
          "Apollo key saved for your company — all teammates can use it"
      );
      setKeyInput("");
      setStatus(data);
    } catch {
      toast.error("Failed to save Apollo key");
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    if (!canManage) {
      toast.error("Only team admins can remove the company Apollo key");
      return;
    }
    if (
      !confirm(
        "Remove the company Apollo key? People/Company search will fall back to the platform key if one exists."
      )
    ) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch("/api/tenant/apollo", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to remove key");
        return;
      }
      toast.success(data.message || "Company Apollo key removed");
      setStatus(data);
    } catch {
      toast.error("Failed to remove Apollo key");
    } finally {
      setRemoving(false);
    }
  };

  const sourceLabel =
    status?.activeSource === "tenant"
      ? "Company key"
      : status?.activeSource === "platform"
        ? "Platform key"
        : "Not connected";

  return (
    <Card className="border-indigo-200 shadow-sm dark:border-indigo-800/60">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-foreground">
          <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          Apollo.io — company key
          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full dark:text-indigo-100 dark:bg-indigo-900/80">
            Tenant-wide BYOK
          </span>
        </CardTitle>
        <CardDescription className="text-muted-foreground dark:text-slate-300">
          Bring your own Apollo master key for this company. Team admins save
          it once; every teammate uses it for Fill job, people search, and AI
          sourcing. Encrypted at rest — never shown in full again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Apollo status…
          </div>
        ) : (
          <div
            className={`rounded-xl border p-4 ${
              status?.connected
                ? "border-green-300 bg-green-50 text-slate-900"
                : "border-amber-300 bg-amber-50 text-slate-900"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {status?.connected ? (
                <Check className="h-4 w-4 shrink-0 text-green-700" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
              )}
              <span className="text-sm font-semibold text-slate-900">
                {status?.connected ? "Apollo connected" : "Apollo not connected"}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-white text-slate-800 border-slate-200">
                {sourceLabel}
              </span>
            </div>
            {status?.healthMessage && (
              <p className="text-xs mt-1.5 text-slate-700">
                {status.healthMessage}
              </p>
            )}
            {status?.hasKey && (
              <div className="mt-2 text-xs space-y-0.5 text-slate-700">
                <p className="font-mono font-medium tracking-wide text-slate-900">
                  {status.keyHint}
                </p>
                {(status.providedByEmail || status.providedByUserId) && (
                  <p>
                    Provided by{" "}
                    <span className="font-semibold text-slate-900">
                      {status.providedByEmail || status.providedByUserId}
                    </span>
                    {status.updatedAt
                      ? ` · ${new Date(status.updatedAt).toLocaleString()}`
                      : ""}
                  </p>
                )}
              </div>
            )}
            {!status?.hasKey && status?.hasPlatformKey && (
              <p className="text-xs mt-1.5 text-slate-700">
                Using the platform Apollo key
                {canManage
                  ? ". Add a company key below to use your own plan and credits."
                  : ". Ask a team admin to add a company key for your own plan and credits."}
              </p>
            )}
          </div>
        )}

        {!loading && !canManage && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex gap-3">
            <Shield className="h-4 w-4 text-slate-600 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 text-sm mb-1">
                Team admin required to change this key
              </p>
              <p>
                You can see connection status above. Only organization team
                admins can save or remove the company Apollo key. Once set,
                every teammate uses it automatically.
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void load()}
                disabled={loading}
                className="mt-2 rounded-lg h-8 px-2 text-slate-800"
              >
                Refresh status
              </Button>
            </div>
          </div>
        )}

        {!loading && canManage && (
          <div className="rounded-xl border-2 border-indigo-200 p-4 space-y-3 bg-indigo-50">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-700" />
              <Label
                htmlFor="apollo-company-key"
                className="text-sm font-semibold text-slate-900"
              >
                Company Apollo API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                Admin only
              </span>
            </div>
            <Input
              id="apollo-company-key"
              type="password"
              autoComplete="off"
              placeholder="Paste Apollo master API key…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="font-mono text-sm bg-white border-indigo-300 text-slate-900 placeholder:text-slate-500"
            />
            <p className="text-[11px] leading-relaxed text-slate-700">
              Create a <strong className="font-semibold text-slate-900">master</strong> key
              with People Search at{" "}
              <a
                href="https://app.apollo.io/#/settings/integrations/api"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-700 underline-offset-2 hover:underline"
              >
                app.apollo.io → Settings → Integrations → API
              </a>
              . Encrypted at rest; never shown in full again. Applies to every
              user in this company.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={saveKey}
                disabled={saving || !keyInput.trim()}
                className="rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {status?.hasKey ? "Replace company key" : "Save company key"}
              </Button>
              {status?.hasKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={removeKey}
                  disabled={removing}
                  className="rounded-lg text-red-700 border-red-300 bg-white hover:bg-red-50"
                >
                  {removing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Unlink className="h-4 w-4 mr-2" />
                      Remove
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg text-slate-800 hover:bg-indigo-100"
              >
                Refresh status
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
