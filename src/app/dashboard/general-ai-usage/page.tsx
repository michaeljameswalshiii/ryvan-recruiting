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
  Wrench,
  Trash2,
  Download,
  History,
  Building2,
  Briefcase,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  explainAiFetchError,
  parseAiFetchResponse,
} from '@/lib/ai/parse-response';
import { AgentRunDesk } from '@/components/ai/AgentRunDesk';
import {
  ActiveRunsRail,
  type AiWorkspace,
} from '@/components/ai/ActiveRunsRail';
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

/** Agentic workspaces launched from the AI home empty state */
const WORKSPACE_STARTERS: {
  id: AiWorkspace;
  title: string;
  description: string;
  icon: typeof Building2;
}[] = [
  {
    id: 'companies',
    title: 'Find companies',
    description: 'Background list builder with email/phone for BD',
    icon: Building2,
  },
  {
    id: 'fill',
    title: 'Fill a job',
    description: 'Apollo-aided sourcing for a careers URL or JD',
    icon: Briefcase,
  },
  {
    id: 'goal',
    title: 'CRM goal',
    description: 'Multi-step agent with mid-run chat & write approval',
    icon: Target,
  },
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

  /**
   * Unified AI home:
   * - chat = interactive assistant (default)
   * - companies | fill | goal = agent workspaces
   */
  type AiView = 'chat' | AiWorkspace;
  const AI_VIEW_KEY = 'trio-ai-home-view-v1';
  const [aiView, setAiView] = useState<AiView>('chat');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_VIEW_KEY);
      if (
        raw === 'chat' ||
        raw === 'companies' ||
        raw === 'fill' ||
        raw === 'goal'
      ) {
        // Always land on chat when opening the page; workspaces are opt-in
        // via starters / Active runs (still allow deep resume if mid-session)
        if (raw !== 'chat') {
          /* keep chat default on hard load */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const openWorkspace = useCallback((ws: AiWorkspace) => {
    setAiView(ws);
    try {
      localStorage.setItem(AI_VIEW_KEY, ws);
    } catch {
      /* ignore */
    }
  }, []);

  const openChatHome = useCallback(() => {
    setAiView('chat');
    try {
      localStorage.setItem(AI_VIEW_KEY, 'chat');
    } catch {
      /* ignore */
    }
  }, []);

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

  // ── Agent workspaces (Find companies / Fill job / CRM goal) ────
  if (aiView !== 'chat') {
    return (
      <div className="-m-6 h-[calc(100vh-4rem)]">
        <AgentRunDesk
          initialTab={aiView}
          homeLabel="AI home"
          onSwitchToChat={openChatHome}
        />
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] bg-slate-100">
      {/* Interactive chat (default) + Active runs rail */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-5 py-3.5 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
              AI
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
              Chat · agents · Apollo
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Chat for quick work. Use starters or Active runs for company lists,
            fill-a-job, and multi-step CRM goals.
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
          <div className="hidden items-center gap-1 sm:flex">
            {WORKSPACE_STARTERS.map((s) => {
              const Icon = s.icon;
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openWorkspace(s.id)}
                  className="gap-1.5 border-violet-200 text-violet-800 hover:bg-violet-50"
                  title={s.description}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{s.title}</span>
                </Button>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openWorkspace('companies')}
            className="gap-1.5 border-violet-200 text-violet-800 sm:hidden"
            title="Open agents"
          >
            <Target className="h-4 w-4" />
            Agents
          </Button>
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
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">
                How can I help?
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Chat for notes, research, and CRM. Launch an agent for company
                lists, fill-a-job, or multi-step goals. History keeps past
                chats with date and time.
              </p>

              {/* Agentic starters */}
              <div className="mt-8 w-full max-w-2xl">
                <p className="mb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Start an agent
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {WORKSPACE_STARTERS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openWorkspace(s.id)}
                        className="rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50 to-white px-3.5 py-3.5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <p className="mt-2.5 text-sm font-semibold text-slate-900">
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                          {s.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                <p className="col-span-full text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Or chat
                </p>
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

      {/* Active runs — list builder + goal history */}
      <div className="hidden min-h-0 lg:flex">
        <ActiveRunsRail onOpenWorkspace={openWorkspace} />
      </div>

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
