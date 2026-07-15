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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  /** Full content sent to / used for multi-turn context (includes file bodies) */
  content: string;
  /** Optional shorter text shown in the bubble (user messages with files) */
  displayContent?: string;
  timestamp: string;
  attachments?: { fileName: string; charCount: number }[];
  toolsUsed?: string[];
  model?: string;
}

const STORAGE_KEY = 'general-ai-usage-messages-v1';
const MAX_HISTORY_TURNS = 24;

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

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function buildUserContent(text: string, files: ChatAttachment[]): string {
  if (!files.length) return text;
  const blocks = files.map(
    (f) =>
      `--- Attached file: ${f.fileName} (${f.charCount} chars) ---\n${f.text}\n--- End of ${f.fileName} ---`
  );
  const body = text.trim() || 'Please review the attached file(s) and provide a useful analysis.';
  return `${body}\n\n${blocks.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GeneralAiUsagePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{
    model?: string;
    toolsUsed?: string[];
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore session chat
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist
  useEffect(() => {
    try {
      if (messages.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      }
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const startNewChat = useCallback(() => {
    if (isLoading) return;
    setMessages([]);
    setInput('');
    setPendingFiles([]);
    setLastMeta(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    toast.success('New chat started');
    textareaRef.current?.focus();
  }, [isLoading]);

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

    // Full multi-turn payload including attachment text from earlier turns
    const historyForApi = prior
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/bedrock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForApi,
          provider: 'bedrock',
          model: 'sonnet',
          generalMode: true,
          useTools: true,
          assistantMode: false,
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        const errText =
          result.suggestion
            ? `${result.message || result.error}\n\n${result.suggestion}`
            : result.message || result.error || 'Request failed';
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: errText,
            timestamp: nowIso(),
          },
        ]);
      } else {
        const toolsUsed: string[] = Array.isArray(result.toolsUsed)
          ? result.toolsUsed
          : [];
        setLastMeta({ model: result.model, toolsUsed });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: result.response || 'No response generated.',
            timestamp: nowIso(),
            toolsUsed,
            model: result.model,
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `Could not reach the AI service: ${msg}`,
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

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              General AI Usage
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <Cloud className="h-3 w-3" />
              Claude Sonnet · Bedrock
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              <Wrench className="h-3 w-3" />
              Tools enabled
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Open-ended assistant with multi-turn context, file attachments, and
            research tools. Use New chat to start fresh.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {messages.length > 0 && (
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
          )}
        </div>
      </header>

      {/* Messages / empty */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
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
                revisions in the same thread. Powered by Claude Sonnet on AWS
                Bedrock with optional Apollo, Tavily, and internal data tools.
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
              {messages.map((m) => (
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
                        m.toolsUsed &&
                        m.toolsUsed.length > 0 &&
                        !m.toolsUsed[0]?.startsWith('available:') && (
                          <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                            {m.toolsUsed.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                              >
                                <Wrench className="h-2.5 w-2.5" />
                                {t}
                              </span>
                            ))}
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
                      Thinking with Sonnet…
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
              placeholder="Message General AI… (Enter to send, Shift+Enter for new line)"
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
              Excel as CSV
            </span>
            {lastMeta?.model && (
              <span className="font-mono text-slate-500">
                last: {lastMeta.model}
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
    </div>
  );
}
