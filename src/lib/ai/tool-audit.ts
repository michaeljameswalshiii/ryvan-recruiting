/**
 * withToolAudit — wrap any async tool-like function with timing + audit log.
 *
 * @serverOnly
 */

import { recordToolAudit } from "@/lib/db/repositories/tool-audit-repository";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";

export async function withToolAudit(
  toolName: string,
  context: ToolContext,
  params: unknown,
  fn: () => Promise<ToolResult>
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    // Fire-and-forget — never break tool execution
    void recordToolAudit({
      tenantId: context.tenantId || "unknown",
      userId: context.userId,
      toolName,
      success: !!result?.success,
      error: result?.error,
      durationMs,
      params,
      resultStatus: result?.success
        ? String(
            (result.data as { status?: string } | undefined)?.status || "ok"
          )
        : "error",
    }).catch(() => {});
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMessage =
      err instanceof Error ? err.message : "Tool execution failed";
    void recordToolAudit({
      tenantId: context.tenantId || "unknown",
      userId: context.userId,
      toolName,
      success: false,
      error: errorMessage,
      durationMs,
      params,
      resultStatus: "exception",
    }).catch(() => {});
    return {
      success: false,
      error: errorMessage,
    };
  }
}
