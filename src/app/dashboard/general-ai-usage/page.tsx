'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  User,
  Send,
  Paperclip,
  Plus,
  Copy,
  Check,
  X,
  FileText,
  Loader2,
  Sparkles,
  Cloud,
  Wrench,
  Trash2,
  Download,
  PanelRightClose,
  PanelRightOpen,
  Columns2,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  explainAiFetchError,
  parseAiFetchResponse,
} from '@/lib/ai/parse-response';
import { AgentWorkbench } from '@/components/ai/AgentWorkbench';
import { AgentRunDesk } from '@/components/ai/AgentRunDesk';
import { ChatHistoryPanel } from '@/components/ai/ChatHistoryPanel';
import {
  type ChatHistoryThread,
  makeThreadId,
  listChatHistory,
  saveChatThread,
  deleteChatThread,
  clearChatHistory,
  formatThreadWhen,
} from '@/lib/ai/chat-history';
import {
  AI_UI_RENDER_MESSAGES,
  AI_UI_STORE_MESSAGES,
  buildSlimApiHistory,
  clampMessageContent,
  downloadFromMeta,
  materializeGeneratedFiles,
  revokeGeneratedFileUrls,
  scheduleCrmCacheInvalidation,
  stripAttachmentBodies,
  type GeneratedFileMeta,
} from '@/lib/ai/chat-client-perf';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatAttachment {
  id: string;
  fileName: string;
  charCount: number;
  text: string;
  warning?: string;
}

/** Downloadable file — base64 is never kept in React state (blob URL only) */
type GeneratedFile = GeneratedFileMeta;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  /** Content for multi-turn context (attachments stripped/capped after first turn) */
  content: string;
  /** Optional shorter text shown in the bubble (user messages with files) */
  displayContent?: string;
  timestamp: string;
  attachments?: { fileName: string; charCount: number }[];
  toolsUsed?: string[];
  /** Full Bedrock model id */
  model?: string;
  /** Friendly name for badge, e.g. "Claude Haiku" */
  modelLabel?: string;
  /** Files produced by generate_file tool (blob URLs, no base64) */
  generatedFiles?: GeneratedFile[];
  /** Model token cost estimate (USD) */
  cost?: number;
  /** AgentCore / external tool spend this turn (USD) */
  estimatedToolCostUsd?: number;
  estimatedTotalCostUsd?: number;
}

/**
 * Platform model pick.
 * "auto" = Most Efficient (Nova Lite → Haiku → Grok 4.3 preferred over Sonnet/Opus).
 * Nova is chat-only; Grok 4.3 / Claude locks keep tools on.
 */
type PlatformModel =
  | 'auto'
  | 'nova-lite'
  | 'haiku'
  | 'grok-4.3'
  | 'sonnet'
  | 'nova-pro';

const PLATFORM_MODELS: {
  id: PlatformModel;
  label: string;
  title: string;
}[] = [
  {
    id: 'auto',
    label: 'Most Efficient',
    title:
      'Most Efficient: Nova Lite (simple) → Haiku (moderate) → Grok 4.3 (tools/CRM; preferred over Sonnet).',
  },
  {
    id: 'nova-lite',
    label: 'Nova Lite',
    title: 'Amazon Nova Lite — cheapest chat (no CRM tools)',
  },
  {
    id: 'haiku',
    label: 'Haiku',
    title: 'Claude Haiku — fast Claude',
  },
  {
    id: 'grok-4.3',
    label: 'Grok 4.3',
    title:
      'Grok 4.3 on Bedrock Mantle (xai.grok-4.3) — preferred for tools/CRM',
  },
  {
    id: 'sonnet',
    label: 'Sonnet',
    title: 'Claude Sonnet — tools + CRM',
  },
  {
    id: 'nova-pro',
    label: 'Nova Pro',
    title: 'Amazon Nova Pro — stronger Amazon chat (no CRM tools)',
  },
];

function downloadGeneratedFile(file: GeneratedFile) {
  try {
    if (!file.downloadUrl) {
      toast.error('Download expired — ask the assistant to regenerate the file');
      return;
    }
    downloadFromMeta(file);
  } catch (e) {
    console.error('[download]', e);
    toast.error('Could not download file');
  }
}

function formatFileSize(n?: number) {
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side fallback if API omits modelLabel */
function labelFromModelId(modelId?: string): string {
  if (!modelId) return 'Claude';
  const id = modelId.toLowerCase();
  if (id.includes('haiku')) return 'Claude Haiku';
  if (id.includes('opus')) return 'Claude Opus';
  if (id.includes('sonnet')) return 'Claude Sonnet';
  if (id.includes('nova-lite') || id.includes('nova-2-lite')) return 'Amazon Nova Lite';
  if (id.includes('nova-pro')) return 'Amazon Nova Pro';
  if (id.includes('nova')) return 'Amazon Nova';
  if (id.includes('grok-4.3') || id.includes('grok-4-3')) return 'Grok 4.3';
  if (id.includes('grok')) return 'Grok';
  return modelId.length > 36 ? `${modelId.slice(0, 33)}…` : modelId;
}

function modelBadgeClass(label?: string): string {
  const l = (label || '').toLowerCase();
  if (l.includes('nova')) {
    return 'border-orange-200 bg-orange-50 text-orange-800';
  }
  if (l.includes('grok')) {
    return 'border-zinc-300 bg-zinc-100 text-zinc-900';
  }
  if (l.includes('haiku')) {
    return 'border-sky-200 bg-sky-50 text-sky-800';
  }
  if (l.includes('opus')) {
    return 'border-violet-200 bg-violet-50 text-violet-800';
  }
  if (l.includes('sonnet')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

/** Legacy key — cleared on mount so page visits always start a new chat */
const LEGACY_SESSION_KEY = 'general-ai-usage-messages-v1';

const SUGGESTIONS = [
  'Summarize the attached document in three bullets',
  'Draft a professional email from these notes',
  'Analyze this data and highlight risks or outliers',
  'Research the latest news on a topic I specify',
  'Help me revise and improve the previous response',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

/** "Today, 11:04 AM" or "Jul 15, 11:04 AM" (include year if not this year) */
function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startToday.getTime() - startMsg.getTime()) / 86400000
    );
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    const sameYear = d.getFullYear() === now.getFullYear();
    const date = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    return `${date}, ${time}`;
  } catch {
    return '';
  }
}

const MAX_ATTACH_CHARS = 24_000;

function buildUserContent(text: string, files: ChatAttachment[]): string {
  if (!files.length) return text;
  const blocks = files.map((f) => {
    const body =
      f.text.length > MAX_ATTACH_CHARS
        ? `${f.text.slice(0, MAX_ATTACH_CHARS)}\n…[truncated, ${f.charCount} total chars]`
        : f.text;
    return `--- Attached file: ${f.fileName} (${f.charCount} chars) ---\n${body}\n--- End of ${f.fileName} ---`;
  });
  const body =
    text.trim() ||
    'Please review the attached file(s) and provide a useful analysis.';
  return clampMessageContent(`${body}\n\n${blocks.join('\n\n')}`, 30_000);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GeneralAiUsagePage() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{
    model?: string;
    modelLabel?: string;
    toolsUsed?: string[];
  } | null>(null);
  const [platformModel, setPlatformModel] = useState<PlatformModel>('auto');

  // Conversation history — page entry always starts a fresh chat
  const [threadId, setThreadId] = useState(() => makeThreadId());
  const [threadCreatedAt, setThreadCreatedAt] = useState(() => nowIso());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyThreads, setHistoryThreads] = useState<ChatHistoryThread[]>(
    []
  );
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);

  // Right agent panel size (persisted)
  type AgentPanelSize = 'collapsed' | 'sm' | 'md' | 'lg';
  const PANEL_KEY = 'trio-agent-panel-size-v1';
  // Start collapsed so AgentWorkbench (job polling) is not mounted until needed
  const [agentPanelSize, setAgentPanelSize] = useState<AgentPanelSize>('collapsed');

  /** Chat (default, interactive) vs multi-step Agent Desk */
  type DeskMode = 'agent' | 'chat';
  const DESK_MODE_KEY = 'trio-ai-desk-mode-v1';
  const [deskMode, setDeskMode] = useState<DeskMode>('chat');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESK_MODE_KEY);
      // Default remains chat for interactive use; agent is opt-in
      if (raw === 'agent' || raw === 'chat') setDeskMode(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const setDeskModePersist = (mode: DeskMode) => {
    setDeskMode(mode);
    try {
      localStorage.setItem(DESK_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const threadCreatedAtRef = useRef(threadCreatedAt);
  threadCreatedAtRef.current = threadCreatedAt;
  const historyUserIdRef = useRef(historyUserId);
  historyUserIdRef.current = historyUserId;

  const refreshHistoryList = useCallback(() => {
    setHistoryThreads(listChatHistory(historyUserIdRef.current));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_KEY);
      if (raw === 'collapsed' || raw === 'sm' || raw === 'md' || raw === 'lg') {
        setAgentPanelSize(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Drop legacy auto-restore; scope history by user when session is known
  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      /* ignore */
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const uid =
          data?.user?.id ||
          data?.userId ||
          data?.user?.userId ||
          data?.session?.userId ||
          null;
        if (uid) setHistoryUserId(String(uid));
      } catch {
        /* anon key */
      } finally {
        if (!cancelled) {
          setHistoryThreads(listChatHistory(historyUserIdRef.current));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshHistoryList();
  }, [historyUserId, refreshHistoryList]);

  const persistCurrentThread = useCallback(() => {
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    saveChatThread({
      threadId: threadIdRef.current,
      messages: msgs as unknown as Record<string, unknown>[],
      userId: historyUserIdRef.current,
      surface: 'general',
      createdAt: threadCreatedAtRef.current,
    });
    refreshHistoryList();
  }, [refreshHistoryList]);

  useEffect(() => {
    if (messages.length === 0) return;
    persistCurrentThread();
  }, [messages, persistCurrentThread]);

  useEffect(() => {
    const onLeave = () => persistCurrentThread();
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      persistCurrentThread();
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [persistCurrentThread]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const startNewChat = useCallback(() => {
    if (isLoading) return;
    persistCurrentThread();
    revokeGeneratedFileUrls(messagesRef.current);
    setMessages([]);
    setInput('');
    setPendingFiles([]);
    setLastMeta(null);
    setThreadId(makeThreadId());
    setThreadCreatedAt(nowIso());
    toast.success('New chat started — prior chat is in History');
    textareaRef.current?.focus();
  }, [isLoading, persistCurrentThread]);

  // Release blob URLs when leaving the page
  useEffect(() => {
    return () => {
      revokeGeneratedFileUrls(messagesRef.current);
    };
  }, []);

  const openHistoryThread = useCallback(
    (thread: ChatHistoryThread) => {
      if (isLoading) {
        toast.message('Wait for the current reply to finish');
        return;
      }
      persistCurrentThread();
      setThreadId(thread.id);
      setThreadCreatedAt(thread.createdAt);
      setMessages(
        thread.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayContent: m.displayContent,
          timestamp: m.timestamp,
          attachments: m.attachments,
          toolsUsed: m.toolsUsed,
          model: m.model,
          modelLabel: m.modelLabel,
          cost: m.cost,
          estimatedToolCostUsd: m.estimatedToolCostUsd,
          estimatedTotalCostUsd: m.estimatedTotalCostUsd,
          // History never stores base64 — downloads require re-generation
          generatedFiles: m.generatedFiles?.map((f) => ({
            fileName: f.fileName,
            mimeType: f.mimeType || 'application/octet-stream',
            sizeBytes: f.sizeBytes,
            format: f.format,
          })),
        }))
      );
      setLastMeta(null);
      setHistoryOpen(false);
      toast.success('Opened conversation from history');
    },
    [isLoading, persistCurrentThread]
  );

  const handleDeleteHistory = useCallback(
    (id: string) => {
      deleteChatThread(id, historyUserId);
      if (id === threadId) {
        setMessages([]);
        setThreadId(makeThreadId());
        setThreadCreatedAt(nowIso());
      }
      refreshHistoryList();
      toast.success('Conversation deleted');
    },
    [historyUserId, threadId, refreshHistoryList]
  );

  const handleClearHistory = useCallback(() => {
    clearChatHistory(historyUserId);
    refreshHistoryList();
    toast.success('All chat history cleared');
  }, [historyUserId, refreshHistoryList]);

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  const onPickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setExtracting(true);
    const next: ChatAttachment[] = [];

    for (const file of Array.from(fileList)) {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/ai/extract-file', {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || `Could not read ${file.name}`);
          continue;
        }
        next.push({
          id: `${Date.now()}-${file.name}`,
          fileName: data.fileName || file.name,
          charCount: data.charCount || 0,
          text: data.text || '',
          warning: data.warning,
        });
        if (data.warning) toast.message(data.warning);
        if (data.truncated) {
          toast.message(`${file.name}: content truncated for context limits`);
        }
      } catch {
        toast.error(`Failed to process ${file.name}`);
      }
    }

    if (next.length) {
      setPendingFiles((prev) => [...prev, ...next]);
    }
    setExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if ((!text && pendingFiles.length === 0) || isLoading) return;

    const filesForTurn = [...pendingFiles];
    const displayContent =
      text ||
      (filesForTurn.length
        ? `Analyze: ${filesForTurn.map((f) => f.fileName).join(', ')}`
        : '');
    const apiContent = buildUserContent(text, filesForTurn);

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      // Keep full text (with attachments) so revisions still see file context
      content: apiContent,
      displayContent,
      timestamp: nowIso(),
      attachments: filesForTurn.map((f) => ({
        fileName: f.fileName,
        charCount: f.charCount,
      })),
    };

    const prior = [...messages, userMessage];
    setMessages(prior);
    setInput('');
    setPendingFiles([]);
    setIsLoading(true);

    // Bounded multi-turn payload — strip old attachment bodies, cap size
    const historyForApi = buildSlimApiHistory(prior);

    try {
      // CRM tools need Claude tool_use; Nova uses Converse chat only.
      // Most Efficient (auto) may escalate to Sonnet when tools are needed.
      const useTools =
        platformModel === 'auto' ||
        platformModel === 'haiku' ||
        platformModel === 'grok-4.3' ||
        platformModel === 'sonnet';

      // Client-side abort so "Failed to fetch" becomes a clear timeout message
      const controller = new AbortController();
      const abortMs = 90_000;
      const abortTimer = setTimeout(() => controller.abort(), abortMs);

      let res: Response;
      try {
        res = await fetch('/api/bedrock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify({
            messages: historyForApi,
            provider: 'bedrock',
            model: platformModel,
            generalMode: true,
            useTools,
            assistantMode: false,
          }),
        });
      } finally {
        clearTimeout(abortTimer);
      }

      const { data: result, errorMessage, nonJson } =
        await parseAiFetchResponse(res);
      if (nonJson) {
        console.warn('[General AI] non-JSON AI response', {
          status: res.status,
          snippet: result.rawSnippet,
        });
      }

      if (errorMessage || result.error) {
        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant' as const,
              content: clampMessageContent(
                errorMessage ||
                  String(
                    result.message ||
                      result.error ||
                      `Request failed (${res.status})`
                  )
              ),
              timestamp: nowIso(),
            },
          ];
          return next.slice(-AI_UI_STORE_MESSAGES);
        });
      } else {
        const toolsUsed: string[] = Array.isArray(result.toolsUsed)
          ? (result.toolsUsed as string[])
          : [];
        const modelId =
          typeof result.model === 'string' ? result.model : undefined;
        const modelLabel =
          (typeof result.modelLabel === 'string' && result.modelLabel) ||
          labelFromModelId(modelId);
        setLastMeta({ model: modelId, modelLabel, toolsUsed });
        // Convert base64 → blob URLs immediately; never keep base64 in state
        const generatedFiles = materializeGeneratedFiles(
          Array.isArray(result.generatedFiles)
            ? (result.generatedFiles as Array<Record<string, unknown>>)
            : []
        );
        const toolCost =
          typeof result.estimatedToolCostUsd === 'number'
            ? result.estimatedToolCostUsd
            : undefined;
        const modelCost =
          typeof result.cost === 'number' ? result.cost : undefined;
        const totalCost =
          typeof result.estimatedTotalCostUsd === 'number'
            ? result.estimatedTotalCostUsd
            : toolCost != null || modelCost != null
              ? (modelCost || 0) + (toolCost || 0)
              : undefined;
        setMessages((prev) => {
          // After the turn is stored, shrink prior attachment bodies in state
          // so memory doesn't grow unbounded across the session.
          const compacted = prev.map((m, i) => {
            if (i === prev.length - 1 && m.role === 'user') {
              // Keep latest user turn's attachment text (already capped for API)
              return {
                ...m,
                content: clampMessageContent(m.content, 12_000),
              };
            }
            if (m.role === 'user' && /--- Attached file:/.test(m.content)) {
              return {
                ...m,
                content: clampMessageContent(stripAttachmentBodies(m.content)),
              };
            }
            if (m.role === 'assistant' && m.content.length > 8_000) {
              return { ...m, content: clampMessageContent(m.content, 8_000) };
            }
            return m;
          });
          const next = [
            ...compacted,
            {
              id: `a-${Date.now()}`,
              role: 'assistant' as const,
              content: clampMessageContent(
                (typeof result.response === 'string' && result.response) ||
                  'No response generated.',
                12_000
              ),
              timestamp: nowIso(),
              toolsUsed,
              model: modelId,
              modelLabel,
              generatedFiles:
                generatedFiles.length > 0 ? generatedFiles : undefined,
              cost: modelCost,
              estimatedToolCostUsd: toolCost,
              estimatedTotalCostUsd: totalCost,
            },
          ];
          return next.slice(-AI_UI_STORE_MESSAGES);
        });
        // CRM tools write on the server — refresh lists after paint (debounced)
        const crmMutated = result.crmMutated === true;
        if (
          crmMutated ||
          toolsUsed.some((t) => /^(create_|update_|link_)/.test(t))
        ) {
          scheduleCrmCacheInvalidation(queryClient, toolsUsed, {
            forceClients:
              crmMutated ||
              toolsUsed.some((t) => /company|contact|client/i.test(t)),
            forceAll: crmMutated,
            delayMs: 800,
          });
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: explainAiFetchError(err),
          timestamp: nowIso(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const isEmpty = messages.length === 0;

  const setPanelSize = (size: AgentPanelSize) => {
    setAgentPanelSize(size);
    try {
      localStorage.setItem(PANEL_KEY, size);
    } catch {
      /* ignore */
    }
  };

  const cyclePanelWider = () => {
    const order: AgentPanelSize[] = ['sm', 'md', 'lg'];
    const i = order.indexOf(
      agentPanelSize === 'collapsed' ? 'md' : agentPanelSize
    );
    setPanelSize(order[Math.min(order.length - 1, Math.max(0, i) + 1)] || 'lg');
  };

  const cyclePanelNarrower = () => {
    const order: AgentPanelSize[] = ['sm', 'md', 'lg'];
    if (agentPanelSize === 'collapsed') return;
    const i = order.indexOf(agentPanelSize);
    if (i <= 0) setPanelSize('collapsed');
    else setPanelSize(order[i - 1]);
  };

  const panelWidthClass =
    agentPanelSize === 'collapsed'
      ? 'lg:w-12'
      : agentPanelSize === 'sm'
        ? 'lg:w-[min(100%,300px)] xl:w-[320px]'
        : agentPanelSize === 'lg'
          ? 'lg:w-[min(100%,520px)] xl:w-[560px]'
          : 'lg:w-[min(100%,400px)] xl:w-[420px]';

  const deskModeToggle = (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => setDeskModePersist('agent')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          deskMode === 'agent'
            ? 'bg-violet-700 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Agent Desk
      </button>
      <button
        type="button"
        onClick={() => setDeskModePersist('chat')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          deskMode === 'chat'
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Chat
      </button>
    </div>
  );

  // ── Agent Desk (multi-step goal runs) ────────────────────────────
  if (deskMode === 'agent') {
    return (
      <div className="relative">
        <div className="absolute left-5 top-3.5 z-30 sm:left-6">
          {deskModeToggle}
        </div>
        <AgentRunDesk />
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col bg-slate-100 lg:flex-row">
      {/* ── Left: interactive chat ─────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-slate-200/80 bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-5 py-3.5 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {deskModeToggle}
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
              Chat
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <Sparkles className="h-3 w-3" />
              {platformModel === 'auto'
                ? 'Most Efficient'
                : PLATFORM_MODELS.find((m) => m.id === platformModel)?.label ||
                  'Platform'}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 sm:inline-flex">
              <Wrench className="h-3 w-3" />
              Quick tasks & CRM
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Instant help — notes, research, CRM updates. Leaving this page
            starts a new chat next visit; open History for past threads.
          </p>
          {/* Model strategy — default Most Efficient, optional lock */}
          <div className="mt-2.5 inline-flex flex-wrap rounded-xl border border-orange-200 bg-orange-50/50 p-1 shadow-sm gap-0.5">
            {PLATFORM_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPlatformModel(m.id)}
                disabled={isLoading}
                title={m.title}
                className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                  platformModel === m.id
                    ? m.id === 'auto'
                      ? 'bg-emerald-700 text-white'
                      : m.id.startsWith('nova')
                        ? 'bg-orange-600 text-white'
                        : m.id === 'grok-4.3'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              refreshHistoryList();
              setHistoryOpen(true);
            }}
            className="gap-1.5"
            title="Past conversations with date & time"
          >
            <History className="h-4 w-4" />
            History
            {historyThreads.length > 0 && (
              <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {historyThreads.length}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startNewChat}
            disabled={isLoading}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
      </header>

      {/* Most-recent history spotlight (when starting fresh) */}
      {isEmpty && historyThreads[0] && (
        <div className="flex-shrink-0 border-b border-emerald-100 bg-emerald-50/60 px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Most recent conversation
              </p>
              <p className="truncate text-sm font-medium text-slate-900">
                {historyThreads[0].title}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatThreadWhen(historyThreads[0].updatedAt).absolute}
                {' · '}
                {historyThreads[0].messages.length} messages
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
              onClick={() => openHistoryThread(historyThreads[0])}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Messages / empty */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {isEmpty ? (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">
                How can I help?
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Ask anything, attach documents for analysis, or request
                revisions in the same thread. Each visit starts a new chat;
                use History for prior conversations with date and time.
              </p>

              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.length > AI_UI_RENDER_MESSAGES && (
                <p className="text-center text-xs text-slate-500">
                  Showing latest {AI_UI_RENDER_MESSAGES} of {messages.length}{' '}
                  messages (older turns still used for context, capped)
                </p>
              )}
              {messages.slice(-AI_UI_RENDER_MESSAGES).map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`group relative max-w-[min(100%,36rem)] ${
                      m.role === 'user' ? 'order-first sm:order-none' : ''
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        m.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      {m.attachments && m.attachments.length > 0 && (
                        <div
                          className={`mb-2 flex flex-wrap gap-1.5 ${
                            m.role === 'user' ? 'text-slate-200' : 'text-slate-500'
                          }`}
                        >
                          {m.attachments.map((a) => (
                            <span
                              key={a.fileName}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                                m.role === 'user'
                                  ? 'bg-white/10'
                                  : 'bg-slate-100'
                              }`}
                            >
                              <FileText className="h-3 w-3" />
                              {a.fileName}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">
                        {m.displayContent ?? m.content}
                      </p>
                      {m.role === 'assistant' &&
                        m.generatedFiles &&
                        m.generatedFiles.length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Downloads
                            </p>
                            {m.generatedFiles.map((f) =>
                              f.downloadUrl ? (
                                <button
                                  key={`${f.fileName}-${f.sizeBytes}`}
                                  type="button"
                                  onClick={() => downloadGeneratedFile(f)}
                                  className="flex w-full items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-left text-sm font-medium text-blue-900 transition hover:bg-blue-100"
                                >
                                  <Download className="h-4 w-4 shrink-0 text-blue-600" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {f.fileName}
                                  </span>
                                  <span className="shrink-0 text-[11px] font-normal text-blue-700/80">
                                    {(f.format || '').toUpperCase()}
                                    {f.sizeBytes
                                      ? ` · ${formatFileSize(f.sizeBytes)}`
                                      : ''}
                                  </span>
                                </button>
                              ) : (
                                <div
                                  key={`${f.fileName}-expired`}
                                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                                >
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{f.fileName}</span>
                                  <span className="ml-auto text-[11px]">
                                    Re-ask to regenerate download
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      {m.role === 'assistant' &&
                        ((m.modelLabel || m.model) ||
                          (m.toolsUsed &&
                            m.toolsUsed.length > 0 &&
                            !m.toolsUsed[0]?.startsWith('available:'))) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                            {(m.modelLabel || m.model) && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${modelBadgeClass(
                                  m.modelLabel || labelFromModelId(m.model)
                                )}`}
                                title={m.model || m.modelLabel}
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                                {m.modelLabel || labelFromModelId(m.model)}
                              </span>
                            )}
                            {m.toolsUsed &&
                              m.toolsUsed.length > 0 &&
                              !m.toolsUsed[0]?.startsWith('available:') &&
                              m.toolsUsed.map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                                >
                                  <Wrench className="h-2.5 w-2.5" />
                                  {t}
                                </span>
                              ))}
                            {(typeof m.estimatedToolCostUsd === 'number' &&
                              m.estimatedToolCostUsd > 0) ||
                            (typeof m.estimatedTotalCostUsd === 'number' &&
                              m.estimatedTotalCostUsd > 0) ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-100"
                                title={
                                  m.estimatedToolCostUsd
                                    ? `Tools ~$${m.estimatedToolCostUsd.toFixed(4)}${
                                        m.cost
                                          ? ` · Model ~$${m.cost.toFixed(4)}`
                                          : ''
                                      }`
                                    : 'Estimated turn cost'
                                }
                              >
                                ~
                                $
                                {(
                                  m.estimatedTotalCostUsd ??
                                  m.estimatedToolCostUsd ??
                                  0
                                ).toFixed(4)}
                              </span>
                            ) : null}
                          </div>
                        )}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400 ${
                        m.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{formatTime(m.timestamp)}</span>
                      {m.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => void copyMessage(m.id, m.content)}
                          className="inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 hover:text-slate-600"
                          title="Copy"
                        >
                          {copiedId === m.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {m.role === 'user' && (
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Choosing model and thinking…
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto max-w-3xl">
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <span className="max-w-[12rem] truncate font-medium">
                    {f.fileName}
                  </span>
                  <span className="text-slate-400">
                    {(f.charCount / 1000).toFixed(1)}k
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(f.id)}
                    className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-label={`Remove ${f.fileName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setPendingFiles([])}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".txt,.md,.csv,.tsv,.json,.jsonl,.xml,.html,.log,.yaml,.yml,.docx,.pdf,.js,.ts,.tsx,.py,.sql"
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-slate-500"
              disabled={isLoading || extracting}
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              {extracting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message AI Assistant… (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={isLoading}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />

            <Button
              type="button"
              size="icon"
              className="h-10 w-10 flex-shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800"
              disabled={
                isLoading ||
                extracting ||
                (!input.trim() && pendingFiles.length === 0)
              }
              onClick={() => void sendMessage()}
              title="Send"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
            <span>
              Multi-turn context · File upload (txt, md, csv, json, docx, pdf) ·
              Excel as CSV · Most Efficient (Nova Lite / Haiku / Grok 4.3)
            </span>
            {lastMeta?.modelLabel && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${modelBadgeClass(
                  lastMeta.modelLabel
                )}`}
                title={lastMeta.model}
              >
                Last used: {lastMeta.modelLabel}
              </span>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNewChat}
                className="text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline sm:hidden"
              >
                New chat
              </button>
            )}
          </div>
        </div>
      </div>
      </section>

      {/* ── Right: autonomous list agent (resizable / collapsible) ── */}
      <aside
        className={`relative flex min-h-0 w-full shrink-0 flex-col border-t border-slate-800 bg-slate-950 transition-[width] duration-200 ease-out lg:border-t-0 ${
          agentPanelSize === 'collapsed'
            ? 'h-12 lg:h-auto'
            : 'h-[min(70vh,640px)] lg:h-auto lg:min-h-0'
        } ${panelWidthClass}`}
      >
        {/* Size controls — always visible on the chat/agent seam */}
        <div
          className={`absolute z-20 flex items-center gap-0.5 ${
            agentPanelSize === 'collapsed'
              ? 'left-1/2 top-2 -translate-x-1/2 lg:left-1/2 lg:top-3 lg:flex-col lg:gap-1'
              : 'left-2 top-2 lg:-left-3 lg:top-3 lg:flex-col'
          }`}
        >
          {agentPanelSize === 'collapsed' ? (
            <button
              type="button"
              onClick={() => setPanelSize('md')}
              title="Expand agent panel"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg ring-2 ring-white/10 hover:bg-violet-500"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-slate-900/95 p-0.5 shadow-lg backdrop-blur lg:flex-col">
              <button
                type="button"
                onClick={() => setPanelSize('collapsed')}
                title="Collapse agent panel"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cyclePanelNarrower}
                title="Narrower panel"
                disabled={agentPanelSize === 'sm'}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <span className="text-[10px] font-bold leading-none">−</span>
              </button>
              <button
                type="button"
                onClick={cyclePanelWider}
                title="Wider panel"
                disabled={agentPanelSize === 'lg'}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <span className="text-[10px] font-bold leading-none">+</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setPanelSize(
                    agentPanelSize === 'md'
                      ? 'lg'
                      : agentPanelSize === 'lg'
                        ? 'sm'
                        : 'md'
                  )
                }
                title={`Size: ${agentPanelSize.toUpperCase()} (click to cycle)`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-violet-200 hover:bg-violet-500/20"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {agentPanelSize === 'collapsed' ? (
          <button
            type="button"
            onClick={() => setPanelSize('md')}
            className="flex h-full min-h-12 w-full flex-col items-center justify-center gap-2 px-1 py-3 text-slate-400 hover:bg-white/5 hover:text-violet-200 lg:py-6"
            title="Expand Company List Builder"
          >
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span
              className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-500 lg:inline"
              style={{ writingMode: 'vertical-rl' }}
            >
              Agent
            </span>
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col pt-1">
            {/* Mount only when panel is open — avoids job polling while hidden */}
            <AgentWorkbench variant="full" />
          </div>
        )}
      </aside>

      <ChatHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        threads={historyThreads}
        activeThreadId={threadId}
        onSelect={openHistoryThread}
        onDelete={handleDeleteHistory}
        onClearAll={handleClearHistory}
      />
    </div>
  );
}
