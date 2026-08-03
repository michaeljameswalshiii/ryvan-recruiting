"use client";

/**
 * Enterprise security settings — MFA policy + SSO flags + audit log.
 * Defaults keep MFA off and SSO off so most users never notice.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield, KeyRound, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type MfaPolicy = "off" | "optional" | "admins" | "all";

type SecurityState = {
  mfaPolicy: MfaPolicy;
  ssoEnabled: boolean;
  ssoProviderName?: string;
  ssoCognitoIdpName?: string;
  ssoNotes?: string;
};

type AuditEvent = {
  id: string;
  action: string;
  severity: string;
  actorEmail?: string;
  actorRole?: string;
  summary?: string;
  createdAt: string;
  ip?: string;
};

const MFA_OPTIONS: { value: MfaPolicy; label: string; hint: string }[] = [
  {
    value: "off",
    label: "Off (default)",
    hint: "No app-level MFA messaging. Cognito MFA still works if a user has it enrolled.",
  },
  {
    value: "optional",
    label: "Optional",
    hint: "Users may enroll MFA in Cognito; not required to sign in.",
  },
  {
    value: "admins",
    label: "Admins only",
    hint: "Policy flag for company/site admins (enforce via Cognito MFA required + enrollment).",
  },
  {
    value: "all",
    label: "All users",
    hint: "Policy flag for full-org MFA (enable Cognito MFA required for the pool).",
  },
];

export function SecuritySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [security, setSecurity] = useState<SecurityState>({
    mfaPolicy: "off",
    ssoEnabled: false,
  });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/security", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSecurity(data.security || { mfaPolicy: "off", ssoEnabled: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load security");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/tenant/audit?limit=40", {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) setEvents(data.events || []);
    } catch {
      /* ignore */
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAudit();
  }, [load, loadAudit]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/security", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(security),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSecurity(data.security);
      toast.success("Security settings saved");
      void loadAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600 py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading security…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card data-ink-on-light className="border-slate-200 bg-white text-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Shield className="h-5 w-5 text-blue-600" />
            Multi-factor authentication (MFA)
          </CardTitle>
          <CardDescription className="text-slate-600">
            Policy defaults to <strong>Off</strong> so nothing changes for your team
            until you choose otherwise. Actual MFA challenges come from AWS Cognito
            when users enroll TOTP/SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {MFA_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition ${
                security.mfaPolicy === opt.value
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="mfaPolicy"
                className="mt-1"
                checked={security.mfaPolicy === opt.value}
                onChange={() =>
                  setSecurity((s) => ({ ...s, mfaPolicy: opt.value }))
                }
              />
              <span>
                <span className="font-semibold text-sm text-slate-900 block">
                  {opt.label}
                </span>
                <span className="text-xs text-slate-600">{opt.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-500 pt-1">
            To enforce MFA in Cognito: User Pool → Sign-in experience → Multi-factor
            authentication. Users then see a code step after password when Cognito
            requires it.
          </p>
        </CardContent>
      </Card>

      <Card data-ink-on-light className="border-slate-200 bg-white text-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <KeyRound className="h-5 w-5 text-violet-600" />
            Single sign-on (SSO)
          </CardTitle>
          <CardDescription className="text-slate-600">
            Off by default. Enable the flag when your IdP (Okta, Azure AD, Google) is
            configured on the Cognito user pool. Most tenants never see SSO until
            this is turned on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="checkbox"
              checked={security.ssoEnabled}
              onChange={(e) =>
                setSecurity((s) => ({ ...s, ssoEnabled: e.target.checked }))
              }
            />
            SSO enabled for this organization
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-slate-800">Provider label</Label>
              <Input
                placeholder="e.g. Okta, Azure AD"
                value={security.ssoProviderName || ""}
                onChange={(e) =>
                  setSecurity((s) => ({
                    ...s,
                    ssoProviderName: e.target.value,
                  }))
                }
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-800">Cognito IdP name</Label>
              <Input
                placeholder="IdP name in Cognito console"
                value={security.ssoCognitoIdpName || ""}
                onChange={(e) =>
                  setSecurity((s) => ({
                    ...s,
                    ssoCognitoIdpName: e.target.value,
                  }))
                }
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-800">Setup notes (internal)</Label>
            <Input
              placeholder="Metadata URL, ticket #, go-live date…"
              value={security.ssoNotes || ""}
              onChange={(e) =>
                setSecurity((s) => ({ ...s, ssoNotes: e.target.value }))
              }
              className="bg-white border-slate-300 text-slate-900"
            />
          </div>
          <p className="text-xs text-slate-500">
            Full SAML/OIDC wiring is done in AWS Cognito (App client + Identity
            provider). Contact platform support to complete Hosted UI for your
            tenant.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Save security settings
        </Button>
      </div>

      <Card data-ink-on-light className="border-slate-200 bg-white text-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <ScrollText className="h-5 w-5 text-emerald-600" />
            Security audit log
          </CardTitle>
          <CardDescription className="text-slate-600">
            Recent auth and admin security events for this organization (silent
            logging — no impact on recruiters).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600 py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-600 py-4 text-center">
              No security events yet. Logins and admin changes will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Actor</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {ev.createdAt
                          ? new Date(ev.createdAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">
                        {ev.action}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {ev.actorEmail || "—"}
                        {ev.actorRole ? (
                          <span className="text-slate-400"> · {ev.actorRole}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {ev.summary || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 border-slate-300 bg-white text-slate-900"
            onClick={() => void loadAudit()}
          >
            Refresh log
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
