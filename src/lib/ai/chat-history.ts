/**
 * Client-side AI chat history (browser localStorage).
 * Threads are per-browser; optional userId scopes the key when known.
 *
 * Design:
 * - Each conversation is a thread with createdAt / updatedAt ISO timestamps
 * - Messages are stored without large base64 file payloads
 * - Callers start a *new* empty chat when entering the AI page;
 *   history is opened deliberately from the History panel
 */

export type ChatHistoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayContent?: string;
  timestamp: string;
  attachments?: { fileName: string; charCount: number }[];
  toolsUsed?: string[];
  model?: string;
  modelLabel?: string;
  /** File metadata only — no base64 */
  generatedFiles?: Array<{
    fileName: string;
    mimeType?: string;
    sizeBytes?: number;
    format?: string;
  }>;
  cost?: number;
  estimatedToolCostUsd?: number;
  estimatedTotalCostUsd?: number;
};

export type ChatHistoryThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatHistoryMessage[];
  lastModelLabel?: string;
  surface?: 'general' | 'floating';
};

const STORAGE_PREFIX = 'trio-ai-chat-history-v1';
const MAX_THREADS = 40;
const MAX_MESSAGES = 100;
/** Cap content chars per message to stay under localStorage quota */
const MAX_CONTENT_CHARS = 12_000;

function storageKey(userId?: string | null): string {
  const u = (userId || 'anon').trim() || 'anon';
  return `${STORAGE_PREFIX}:${u}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeThreadId(): string {
  return newId();
}

export function titleFromMessages(
  messages: Array<{ role: string; content?: string; displayContent?: string }>
): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const raw = (
    firstUser?.displayContent ||
    firstUser?.content ||
    'New conversation'
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'New conversation';
  return raw.length > 72 ? raw.slice(0, 69) + '…' : raw;
}

export function slimMessage(m: ChatHistoryMessage | Record<string, unknown>): ChatHistoryMessage {
  const content = String(m.content || '').slice(0, MAX_CONTENT_CHARS);
  const displayContent =
    typeof m.displayContent === 'string'
      ? m.displayContent.slice(0, 500)
      : undefined;
  const generatedFiles = Array.isArray(m.generatedFiles)
    ? (m.generatedFiles as Array<Record<string, unknown>>).map((f) => ({
        fileName: String(f.fileName || 'file'),
        mimeType: f.mimeType ? String(f.mimeType) : undefined,
        sizeBytes:
          typeof f.sizeBytes === 'number' ? f.sizeBytes : undefined,
        format: f.format ? String(f.format) : undefined,
      }))
    : undefined;

  return {
    id: String(m.id || newId()),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content,
    displayContent,
    timestamp:
      typeof m.timestamp === 'string' && m.timestamp
        ? m.timestamp
        : new Date().toISOString(),
    attachments: Array.isArray(m.attachments)
      ? (m.attachments as ChatHistoryMessage['attachments'])
      : undefined,
    toolsUsed: Array.isArray(m.toolsUsed)
      ? (m.toolsUsed as string[])
      : undefined,
    model: typeof m.model === 'string' ? m.model : undefined,
    modelLabel: typeof m.modelLabel === 'string' ? m.modelLabel : undefined,
    generatedFiles,
    cost: typeof m.cost === 'number' ? m.cost : undefined,
    estimatedToolCostUsd:
      typeof m.estimatedToolCostUsd === 'number'
        ? m.estimatedToolCostUsd
        : undefined,
    estimatedTotalCostUsd:
      typeof m.estimatedTotalCostUsd === 'number'
        ? m.estimatedTotalCostUsd
        : undefined,
  };
}

function readAll(userId?: string | null): ChatHistoryThread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatHistoryThread[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && t.id && Array.isArray(t.messages))
      .map((t) => ({
        ...t,
        title: t.title || 'Conversation',
        createdAt: t.createdAt || t.updatedAt || new Date().toISOString(),
        updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
        messages: t.messages.map((m) => slimMessage(m)),
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    return [];
  }
}

function writeAll(threads: ChatHistoryThread[], userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = threads
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, MAX_THREADS);
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch (err) {
    // Quota exceeded — drop oldest half and retry once
    try {
      const half = threads
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, Math.floor(MAX_THREADS / 2));
      localStorage.setItem(storageKey(userId), JSON.stringify(half));
    } catch {
      console.warn('[chat-history] localStorage write failed', err);
    }
  }
}

export function listChatHistory(userId?: string | null): ChatHistoryThread[] {
  return readAll(userId);
}

export function getChatThread(
  threadId: string,
  userId?: string | null
): ChatHistoryThread | null {
  return readAll(userId).find((t) => t.id === threadId) || null;
}

/**
 * Upsert a thread from the live message list.
 * No-op if fewer than 1 user message (empty drafts are not saved).
 */
export function saveChatThread(params: {
  threadId: string;
  messages: Array<Record<string, unknown> | ChatHistoryMessage>;
  userId?: string | null;
  surface?: 'general' | 'floating';
  createdAt?: string;
}): ChatHistoryThread | null {
  const slim = params.messages
    .map((m) => slimMessage(m as ChatHistoryMessage))
    .slice(-MAX_MESSAGES);

  const hasUser = slim.some((m) => m.role === 'user' && m.content.trim());
  if (!hasUser) return null;

  const now = new Date().toISOString();
  const all = readAll(params.userId);
  const existing = all.find((t) => t.id === params.threadId);
  const lastAssistant = [...slim].reverse().find((m) => m.role === 'assistant');

  const thread: ChatHistoryThread = {
    id: params.threadId,
    title: titleFromMessages(slim),
    createdAt: existing?.createdAt || params.createdAt || now,
    updatedAt: now,
    messages: slim,
    lastModelLabel: lastAssistant?.modelLabel || existing?.lastModelLabel,
    surface: params.surface || existing?.surface || 'general',
  };

  const next = [thread, ...all.filter((t) => t.id !== params.threadId)];
  writeAll(next, params.userId);
  return thread;
}

export function deleteChatThread(
  threadId: string,
  userId?: string | null
): void {
  writeAll(
    readAll(userId).filter((t) => t.id !== threadId),
    userId
  );
}

export function clearChatHistory(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Relative label + full local date/time for tooltips */
export function formatThreadWhen(iso: string): {
  relative: string;
  absolute: string;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { relative: '', absolute: iso };
  }
  const absolute = d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  let relative: string;
  if (mins < 1) relative = 'Just now';
  else if (mins < 60) relative = `${mins}m ago`;
  else if (hours < 24) relative = `${hours}h ago`;
  else if (days === 1) relative = 'Yesterday';
  else if (days < 7) relative = `${days}d ago`;
  else relative = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return { relative, absolute };
}
