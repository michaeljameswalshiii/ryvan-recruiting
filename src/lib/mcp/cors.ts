/**
 * CORS helpers for remote MCP clients (Claude.ai, Claude Code, Cursor, etc.).
 *
 * @serverOnly
 */

const ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "Mcp-Session-Id",
  "MCP-Protocol-Version",
  "Last-Event-ID",
  "X-Trio-Tenant-Id",
  "X-Trio-Api-Key",
  "X-Api-Key",
].join(", ");

export function mcpCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Max-Age": "86400",
  };
}

export function withMcpCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(mcpCorsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function mcpOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: mcpCorsHeaders(),
  });
}
