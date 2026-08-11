"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Plus,
  Copy,
  Check,
  Trash2,
  Terminal,
  Cloud,
  Globe,
  ShieldCheck,
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

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  created_by: string;
  last_used_at?: string;
};

type OAuthClientRow = {
  id: string;
  name: string;
  client_id: string;
  client_secret_prefix: string;
  redirect_uris: string[];
  created_at: string;
};

export function McpKeysSettings() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Claude Desktop");
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [remoteSnippet, setRemoteSnippet] = useState<string | null>(null);
  const [claudeCodeCli, setClaudeCodeCli] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [oauthClients, setOauthClients] = useState<OAuthClientRow[]>([]);
  const [oauthName, setOauthName] = useState("Claude Connector");
  const [oauthRedirectUri, setOauthRedirectUri] = useState(
    "https://claude.ai/api/mcp/auth_callback, https://claude.com/api/mcp/auth_callback"
  );
  const [creatingOauth, setCreatingOauth] = useState(false);
  const [newOauth, setNewOauth] = useState<{
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, oauthRes] = await Promise.all([
        fetch("/api/tenant/mcp-keys", { credentials: "include" }),
        fetch("/api/tenant/mcp-oauth-clients", { credentials: "include" }),
      ]);
      const [data, oauthData] = await Promise.all([
        res.json().catch(() => ({})),
        oauthRes.json().catch(() => ({})),
      ]);
      if (!res.ok) throw new Error(data.error || "Failed to load keys");
      if (!oauthRes.ok) throw new Error(oauthData.error || "Failed to load OAuth clients");
      setKeys(data.keys || []);
      setOauthClients(oauthData.clients || []);
      setTenantId(data.tenantId || "");
      const origin = data.appUrl || window.location.origin;
      setAppUrl(origin);
      setMcpUrl(
        data.mcpUrl ||
          `${String(origin).replace(/\/$/, "")}/api/mcp`
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to load MCP keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createKey = async () => {
    setCreating(true);
    setNewPlaintext(null);
    setRemoteSnippet(null);
    setClaudeCodeCli(null);
    try {
      const res = await fetch("/api/tenant/mcp-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Claude MCP" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create key");
      setNewPlaintext(data.plaintext);
      const cfg = data.claudeRemoteConfig || data.claudeDesktopConfig;
      setRemoteSnippet(cfg ? JSON.stringify(cfg, null, 2) : null);
      setClaudeCodeCli(data.claudeCodeCli || null);
      setAppUrl(data.appUrl || appUrl);
      setTenantId(data.tenantId || tenantId);
      if (data.mcpUrl) setMcpUrl(data.mcpUrl);
      toast.success("API key created — copy it now");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string, label: string) => {
    if (
      !confirm(
        `Revoke MCP key “${label}”? Claude clients using it will stop working.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/tenant/mcp-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to revoke");
      toast.success("Key revoked");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke");
    }
  };

  const createOauthClient = async () => {
    setCreatingOauth(true);
    setNewOauth(null);
    try {
      const res = await fetch("/api/tenant/mcp-oauth-clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: oauthName.trim() || "Claude Connector",
          redirectUris: oauthRedirectUri
            .split(/[,\n]/)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create OAuth client");
      setNewOauth({
        clientId: data.client.client_id,
        clientSecret: data.clientSecret,
        authorizationUrl: data.authorizationUrl,
        tokenUrl: data.tokenUrl,
      });
      toast.success("OAuth client created - copy the secret now");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create OAuth client");
    } finally {
      setCreatingOauth(false);
    }
  };

  const revokeOauthClient = async (id: string, label: string) => {
    if (!confirm(`Revoke OAuth client "${label}"? Existing access and refresh tokens will stop working.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/tenant/mcp-oauth-clients/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to revoke OAuth client");
      toast.success("OAuth client revoked");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke OAuth client");
    }
  };

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-violet-100 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-violet-600" />
            Claude / MCP connections
          </CardTitle>
          <CardDescription>
            Fully remote — paste a URL and API key into Claude. No local install,
            no AWS credentials, no repo clone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <div>
                  <span className="text-slate-500">Remote MCP URL: </span>
                  <code className="text-xs break-all">{mcpUrl || "—"}</code>
                  {mcpUrl && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-blue-600 hover:underline"
                      onClick={() => void copyText(mcpUrl, "mcpurl")}
                    >
                      {copied === "mcpurl" ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">Tenant ID: </span>
                  <code className="text-xs">{tenantId || "—"}</code>
                  {tenantId && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-blue-600 hover:underline"
                      onClick={() => void copyText(tenantId, "tenant")}
                    >
                      {copied === "tenant" ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 pt-1">
                  Headers required:{" "}
                  <code className="text-[11px]">Authorization: Bearer …</code>{" "}
                  and{" "}
                  <code className="text-[11px]">X-Trio-Tenant-Id</code>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label htmlFor="mcp-key-name">Key label</Label>
              <Input
                id="mcp-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Claude Desktop — Michael"
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => void createKey()}
              disabled={creating}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create API key
            </Button>
          </div>

          {newPlaintext && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-900">
                Copy this key now — it won&apos;t be shown again
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 break-all rounded-lg bg-white border border-amber-100 px-3 py-2 text-xs">
                  {newPlaintext}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(newPlaintext, "key")}
                >
                  {copied === "key" ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  Copy key
                </Button>
              </div>

              {remoteSnippet && (
                <div>
                  <p className="text-xs text-amber-800 mb-1 font-medium">
                    Claude Code / remote MCP config (paste into{" "}
                    <code className="text-[11px]">.mcp.json</code> or Claude
                    settings — no local package):
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3">
                    {remoteSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void copyText(remoteSnippet, "cfg")}
                  >
                    {copied === "cfg" ? (
                      <Check className="h-4 w-4 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy config JSON
                  </Button>
                </div>
              )}

              {claudeCodeCli && (
                <div>
                  <p className="text-xs text-amber-800 mb-1">
                    Or one-liner for Claude Code CLI:
                  </p>
                  <pre className="max-h-24 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3 break-all whitespace-pre-wrap">
                    {claudeCodeCli}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void copyText(claudeCodeCli, "cli")}
                  >
                    {copied === "cli" ? (
                      <Check className="h-4 w-4 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy CLI command
                  </Button>
                </div>
              )}

              <div className="text-xs text-amber-900/80 border-t border-amber-200 pt-3 space-y-1">
                <p className="font-medium">Claude.ai / Desktop (Connectors)</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Settings → Connectors → Add custom connector</li>
                  <li>
                    URL: <code className="text-[11px]">{mcpUrl}</code>
                  </li>
                  <li>
                    Auth headers (static / beta): Bearer key +{" "}
                    <code className="text-[11px]">X-Trio-Tenant-Id</code>
                  </li>
                </ol>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Active keys
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : keys.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                No API keys yet. Create one to connect Claude.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-slate-900">
                        {k.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {k.prefix} · created{" "}
                        {k.created_at
                          ? new Date(k.created_at).toLocaleString()
                          : "—"}
                        {k.last_used_at
                          ? ` · last used ${new Date(k.last_used_at).toLocaleString()}`
                          : ""}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => void revoke(k.id, k.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                OAuth 2.1 clients
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Recommended for Claude custom connectors. Uses authorization code with PKCE, short-lived access tokens, and refresh tokens.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] md:items-end">
              <div>
                <Label htmlFor="mcp-oauth-name">Client label</Label>
                <Input
                  id="mcp-oauth-name"
                  value={oauthName}
                  onChange={(event) => setOauthName(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="mcp-oauth-redirect">OAuth callback URLs</Label>
                <Input
                  id="mcp-oauth-redirect"
                  value={oauthRedirectUri}
                  onChange={(event) => setOauthRedirectUri(event.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <Button
                onClick={() => void createOauthClient()}
                disabled={creatingOauth || !oauthRedirectUri.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creatingOauth ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create OAuth client
              </Button>
            </div>

            {newOauth && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-950">
                  Copy the client secret now - it will not be shown again.
                </p>
                {[
                  ["Client ID", newOauth.clientId, "oauth-client-id"],
                  ["Client secret", newOauth.clientSecret, "oauth-client-secret"],
                  ["Authorization URL", newOauth.authorizationUrl, "oauth-auth-url"],
                  ["Token URL", newOauth.tokenUrl, "oauth-token-url"],
                ].map(([label, value, copyId]) => (
                  <div key={copyId} className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
                    <span className="text-xs font-medium text-amber-900">{label}</span>
                    <code className="break-all rounded border border-amber-100 bg-white px-2.5 py-2 text-xs">{value}</code>
                    <Button variant="outline" size="sm" onClick={() => void copyText(value, copyId)}>
                      {copied === copyId ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                      Copy
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {oauthClients.length === 0 ? (
              <p className="text-sm text-slate-500">No OAuth clients yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {oauthClients.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{client.name}</div>
                      <div className="truncate font-mono text-xs text-slate-500">{client.client_id}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Callback: {client.redirect_uris.join(", ")}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => void revokeOauthClient(client.id, client.name)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-slate-500 space-y-1 border-t pt-4">
            <p className="font-medium text-slate-700 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              What the key can do
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Search and view candidates</li>
              <li>List jobs</li>
              <li>Add activity notes</li>
            </ul>
            <p className="pt-1">
              Keys are organization-scoped. Only customer admins can create or
              revoke them. App origin:{" "}
              <code className="text-[11px]">{appUrl || "—"}</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
