/**
 * Client-side AI chat performance helpers.
 * Keeps multi-turn chats from freezing Chrome via:
 * - slim API history (char caps, strip old attachments)
 * - base64 → blob URL for downloads (drop base64 from React state)
 * - debounced CRM cache invalidation
 *
 * @clientSafe
 */

import type { QueryClient } from '@tanstack/react-query';
import { invalidateCrmCaches } from '@/lib/hooks/invalidate-crm-cache';

/** Max turns sent to /api/bedrock (keeps request body bounded) */
export const AI_API_HISTORY_TURNS = 12;

/** Cap each message content when building API history */
export const AI_API_MSG_MAX_CHARS = 6_000;

/** Cap total chars across the history payload */
export const AI_API_TOTAL_MAX_CHARS = 36_000;

/** How many messages to keep fully rendered in the DOM */
export const AI_UI_RENDER_MESSAGES = 40;

/** sessionStorage / local message cap */
export const AI_UI_STORE_MESSAGES = 50;

const ATTACH_START = /--- Attached file: .+? ---/;
const ATTACH_BLOCK =
  /--- Attached file: ([^\n(]+?)(?:\s*\(\d+\s*chars?\))? ---\n[\s\S]*?--- End of \1 ---/gi;

/**
 * Strip full attached-file bodies from multi-turn user content.
 * Keeps a short stub so the model knows a file was there.
 */
export function stripAttachmentBodies(content: string): string {
  if (!content || !ATTACH_START.test(content)) return content;
  return content.replace(ATTACH_BLOCK, (_m, name: string) => {
    const fileName = String(name || 'file').trim();
    return `[Attached file: ${fileName} — body omitted from history; already analyzed earlier]`;
  });
}

export function clampMessageContent(
  content: string,
  maxChars = AI_API_MSG_MAX_CHARS
): string {
  const s = String(content || '');
  if (s.length <= maxChars) return s;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.floor(maxChars * 0.25);
  return `${s.slice(0, head)}\n\n…[truncated ${s.length - maxChars} chars]…\n\n${s.slice(-tail)}`;
}

export type ApiChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Build a bounded multi-turn payload for /api/bedrock.
 * - last N turns only
 * - strip attachment bodies from older turns (keep latest user attachment full, capped)
 * - per-message + total char caps
 */
export function buildSlimApiHistory(
  messages: Array<{ role: string; content?: string }>,
  options?: { maxTurns?: number; maxPerMsg?: number; maxTotal?: number }
): ApiChatMessage[] {
  const maxTurns = options?.maxTurns ?? AI_API_HISTORY_TURNS;
  const maxPerMsg = options?.maxPerMsg ?? AI_API_MSG_MAX_CHARS;
  const maxTotal = options?.maxTotal ?? AI_API_TOTAL_MAX_CHARS;

  const turns = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxTurns);

  const lastUserIdx = (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === 'user') return i;
    }
    return -1;
  })();

  const slimmed: ApiChatMessage[] = turns.map((m, i) => {
    let content = String(m.content || '');
    // Keep full attachment body only on the latest user turn (still capped)
    if (i !== lastUserIdx) {
      content = stripAttachmentBodies(content);
    }
    content = clampMessageContent(content, maxPerMsg);
    return {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content,
    };
  });

  // Enforce total budget from the end (keep most recent)
  let total = slimmed.reduce((n, m) => n + m.content.length, 0);
  if (total <= maxTotal) return slimmed;

  const out = [...slimmed];
  for (let i = 0; i < out.length && total > maxTotal; i++) {
    const over = total - maxTotal;
    const budget = Math.max(800, out[i].content.length - over);
    if (out[i].content.length > budget) {
      const before = out[i].content.length;
      out[i] = {
        ...out[i],
        content: clampMessageContent(out[i].content, budget),
      };
      total -= before - out[i].content.length;
    }
  }
  return out;
}

export type GeneratedFileMeta = {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  format?: string;
  /** Object URL for download — revoke when clearing chat */
  downloadUrl?: string;
};

/**
 * Convert API generated files (base64) → metadata + blob URLs.
 * Drops base64 so React state stays small.
 */
export function materializeGeneratedFiles(
  files: Array<{
    fileName?: string;
    mimeType?: string;
    contentBase64?: string;
    sizeBytes?: number;
    format?: string;
  }>
): GeneratedFileMeta[] {
  if (!Array.isArray(files) || typeof window === 'undefined') return [];
  const out: GeneratedFileMeta[] = [];
  for (const f of files) {
    if (!f?.fileName || !f.contentBase64) continue;
    try {
      const bin = atob(f.contentBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = f.mimeType || 'application/octet-stream';
      const blob = new Blob([bytes], { type: mime });
      const downloadUrl = URL.createObjectURL(blob);
      out.push({
        fileName: String(f.fileName),
        mimeType: mime,
        sizeBytes:
          typeof f.sizeBytes === 'number' ? f.sizeBytes : bytes.byteLength,
        format: f.format ? String(f.format) : undefined,
        downloadUrl,
      });
    } catch (err) {
      console.warn('[ai-perf] failed to materialize generated file', f.fileName, err);
    }
  }
  return out;
}

/** Revoke blob URLs from messages (call on new chat / unmount) */
export function revokeGeneratedFileUrls(
  messages: Array<{ generatedFiles?: GeneratedFileMeta[] | undefined }>
): void {
  if (typeof window === 'undefined') return;
  for (const m of messages) {
    for (const f of m.generatedFiles || []) {
      if (f.downloadUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(f.downloadUrl);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export function downloadFromMeta(file: GeneratedFileMeta): void {
  if (!file.downloadUrl) {
    console.warn('[ai-perf] no downloadUrl for', file.fileName);
    return;
  }
  const a = document.createElement('a');
  a.href = file.downloadUrl;
  a.download = file.fileName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------
// Debounced CRM invalidation — avoid refetch storm mid-parse
// ---------------------------------------------------------------------------

type PendingInvalidate = {
  tools: string[];
  forceClients: boolean;
  forceAll: boolean;
  timer: ReturnType<typeof setTimeout>;
};

const pendingByClient = new WeakMap<QueryClient, PendingInvalidate>();

/**
 * Schedule CRM cache invalidation after a short delay so it doesn't
 * compete with AI response JSON parse + React paint.
 */
export function scheduleCrmCacheInvalidation(
  queryClient: QueryClient,
  toolsUsed: string[],
  options?: { forceClients?: boolean; forceAll?: boolean; delayMs?: number }
): void {
  const delayMs = options?.delayMs ?? 750;
  const existing = pendingByClient.get(queryClient);
  if (existing) {
    clearTimeout(existing.timer);
    const tools = Array.from(
      new Set([...(existing.tools || []), ...(toolsUsed || [])])
    );
    const forceClients = !!(existing.forceClients || options?.forceClients);
    const forceAll = !!(existing.forceAll || options?.forceAll);
    const timer = setTimeout(() => {
      pendingByClient.delete(queryClient);
      void invalidateCrmCaches(queryClient, tools, { forceClients, forceAll });
    }, delayMs);
    pendingByClient.set(queryClient, {
      tools,
      forceClients,
      forceAll,
      timer,
    });
    return;
  }
  const tools = [...(toolsUsed || [])];
  const forceClients = !!options?.forceClients;
  const forceAll = !!options?.forceAll;
  const timer = setTimeout(() => {
    pendingByClient.delete(queryClient);
    void invalidateCrmCaches(queryClient, tools, { forceClients, forceAll });
  }, delayMs);
  pendingByClient.set(queryClient, {
    tools,
    forceClients,
    forceAll,
    timer,
  });
}
