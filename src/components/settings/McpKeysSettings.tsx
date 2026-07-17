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

export function McpKeysSettings() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Claude Desktop");
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [claudeSnippet, setClaudeSnippet] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/mcp-keys", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load keys");
      setKeys(data.keys || []);
      setTenantId(data.tenantId || "");
      setAppUrl(data.appUrl || window.location.origin);
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
    setClaudeSnippet(null);
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
      setClaudeSnippet(JSON.stringify(data.claudeDesktopConfig, null, 2));
      setAppUrl(data.appUrl || appUrl);
      setTenantId(data.tenantId || tenantId);
      toast.success("API key created — copy it now");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string, label: string) => {
    if (!confirm(`Revoke MCP key “${label}”? Claude clients using it will stop working.`)) {
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
            <Terminal className="h-5 w-5 text-violet-600" />
            Claude / MCP connections
          </CardTitle>
          <CardDescription>
            Create an API key so someone can connect Claude Desktop or Claude Code
            to this Trio organization. They only need the key, app URL, and tenant
            id — no AWS credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm space-y-1">
            <div>
              <span className="text-slate-500">App URL: </span>
              <code className="text-xs">{appUrl || "—"}</code>
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
              {claudeSnippet && (
                <div>
                  <p className="text-xs text-amber-800 mb-1">
                    Claude Desktop config snippet (replace PATH_TO_REPO with your
                    local clone path, then restart Claude):
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3">
                    {claudeSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void copyText(claudeSnippet, "cfg")}
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

          <div className="text-xs text-slate-500 space-y-1 border-t pt-4">
            <p className="font-medium text-slate-700">What the key can do</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Search and view candidates</li>
              <li>List jobs</li>
              <li>Add activity notes</li>
            </ul>
            <p className="pt-1">
              Keys are organization-scoped. Only customer admins can create or
              revoke them.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
