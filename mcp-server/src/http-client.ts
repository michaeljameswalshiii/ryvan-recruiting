/**
 * HTTP client for Trio MCP tools (app-hosted API key auth).
 * No AWS credentials required on the Claude machine.
 */

export type HttpConfig = {
  appUrl: string;
  apiKey: string;
  tenantId: string;
};

export function getHttpConfig(): HttpConfig | null {
  const mode = (process.env.TRIO_MCP_MODE || "").toLowerCase();
  const appUrl = (process.env.TRIO_APP_URL || "").replace(/\/$/, "");
  const apiKey = (process.env.TRIO_MCP_API_KEY || "").trim();
  const tenantId = (process.env.TRIO_TENANT_ID || "").trim();

  // HTTP mode when explicitly set, or when APP_URL is present
  const useHttp =
    mode === "http" ||
    mode === "remote" ||
    (!!appUrl && mode !== "dynamodb" && mode !== "direct");

  if (!useHttp || !appUrl || !apiKey || !tenantId) return null;
  return { appUrl, apiKey, tenantId };
}

export async function mcpFetch(
  cfg: HttpConfig,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const url = `${cfg.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      "X-Trio-Tenant-Id": cfg.tenantId,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ||
        `HTTP ${res.status} ${res.statusText}`
    );
  }
  return data;
}
