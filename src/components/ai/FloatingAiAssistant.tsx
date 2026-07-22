'use client';

/**
 * Global floating AI assistant for dashboard pages.
 * Fab → slide-over panel, same /api/bedrock generalMode tools as AI Assistant page.
 * Page context (candidate / job / company / contact ids) is sent with each request.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCrmCaches } from '@/lib/hooks/invalidate-crm-cache';
import {
  explainAiFetchError,
  parseAiFetchResponse,
} from '@/lib/ai/parse-response';
import { AgentWorkbench } from '@/components/ai/AgentWorkbench';

// ---------------------------------------------------------------------------
// Types / storage
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  modelLabel?: string;
}

const OPEN_KEY = 'trio-floating-ai-open-v1';
const MESSAGES_KEY = 'trio-floating-ai-messages-v1';
const MAX_HISTORY = 20;

// ---------------------------------------------------------------------------
// Page context from URL
// ---------------------------------------------------------------------------

export type PageContextInfo = {
  label: string;
  entityType?: 'candidate' | 'job' | 'company' | 'contact' | 'other';
  entityId?: string;
  path: string;
  href?: string;
  /** Multi-line string for the model system prompt */
  forModel: string;
};

export function parseDashboardPageContext(pathname: string): PageContextInfo {
  const path = pathname || '/dashboard';
  const parts = path.split('/').filter(Boolean);
  // ["dashboard", "candidates", "uuid"] etc.

  const uuidLike = (s?: string) =>
    !!s &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      s
    ) ||
      s.length > 10);

  if (parts[0] !== 'dashboard') {
    return {
      label: 'App',
      path,
      forModel: `Path: ${path}`,
    };
  }

  const section = parts[1] || '';
  const id = parts[2];
  const sub = parts[3];

  if (section === 'candidates' && uuidLike(id) && sub !== 'edit') {
    return {
      label: 'Candidate',
      entityType: 'candidate',
      entityId: id,
      path,
      href: `/dashboard/candidates/${id}`,
      forModel: [
        `Page: Candidate detail`,
        `candidate_id: ${id}`,
        `path: ${path}`,
        `Prefer tools that use this candidate_id when the user says "this candidate" / "them".`,
      ].join('\n'),
    };
  }

  if (section === 'candidates' && id === 'new') {
    return {
      label: 'New candidate',
      entityType: 'candidate',
      path,
      forModel: `Page: New candidate form\npath: ${path}`,
    };
  }

  if (section === 'jobs' && uuidLike(id)) {
    return {
      label: 'Job',
      entityType: 'job',
      entityId: id,
      path,
      href: `/dashboard/jobs/${id}`,
      forModel: [
        `Page: Job detail`,
        `job_id: ${id}`,
        `path: ${path}`,
        `Prefer tools that use this job_id when the user says "this job" / "this req".`,
      ].join('\n'),
    };
  }

  if (section === 'companies' && uuidLike(id) && sub !== 'edit') {
    return {
      label: 'Company',
      entityType: 'company',
      entityId: id,
      path,
      href: `/dashboard/companies/${id}`,
      forModel: [
        `Page: Company detail`,
        `company_id / client_id: ${id}`,
        `path: ${path}`,
        `Prefer tools that use this company when the user says "this company" / "this client".`,
      ].join('\n'),
    };
  }

  if (
    (section === 'contacts' || section === 'contact-info') &&
    uuidLike(id)
  ) {
    return {
      label: 'Contact',
      entityType: 'contact',
      entityId: id,
      path,
      href: path,
      forModel: [
        `Page: Contact detail`,
        `contact_id: ${id}`,
        `path: ${path}`,
      ].join('\n'),
    };
  }

  if (section === 'sequences') {
    return {
      label: 'Sequences',
      path,
      forModel: `Page: Sequences\npath: ${path}`,
    };
  }

  if (section === 'pipeline') {
    return {
      label: 'Pipeline',
      path,
      forModel: `Page: Pipeline board\npath: ${path}`,
    };
  }

  if (!section || section === '') {
    return {
      label: 'Dashboard',
      path,
      forModel: `Page: Dashboard home\npath: ${path}`,
    };
  }

  const pretty = section.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    label: pretty,
    path,
    forModel: `Page: ${pretty}\npath: ${path}`,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloatingAiAssistant() {
  const pathname = usePathname() || '';
  const queryClient = useQueryClient();
  const pageCtx = useMemo(
    () => parseDashboardPageContext(pathname),
    [pathname]
  );

  // Hide on full AI pages (avoid double chat UX)
  const hideOnPage =
    pathname.startsWith('/dashboard/general-ai-usage') ||
    pathname.startsWith('/dashboard/ai-assistant');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Restore open + thread from session
  useEffect(() => {
    try {
      const o = sessionStorage.getItem(OPEN_KEY);
      if (o === '1') setOpen(true);
      const raw = sessionStorage.getItem(MESSAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (messages.length === 0) {
        sessionStorage.removeItem(MESSAGES_KEY);
      } else {
        sessionStorage.setItem(
          MESSAGES_KEY,
          JSON.stringify(messages.slice(-40))
        );
      }
    } catch {
      /* ignore */
    }
  }, [messages, hydrated]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Focus after open animation
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, messages, isLoading]);

  // Keyboard: ⌘J / Ctrl+J toggle; Esc close
  useEffect(() => {
    if (hideOnPage) return;
    const onKey = (e: KeyboardEvent) => {
      const isToggle =
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'j' || e.key === 'J');
      if (isToggle) {
        // Don't steal if user is in a contenteditable with intentional cmd+j (rare)
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideOnPage, open]);

  const startNewChat = useCallback(() => {
    if (isLoading) return;
    setMessages([]);
    setInput('');
    try {
      sessionStorage.removeItem(MESSAGES_KEY);
    } catch {
      /* ignore */
    }
    toast.success('New chat');
    inputRef.current?.focus();
  }, [isLoading]);

  const sendMessage = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: nowIso(),
    };
    const prior = [...messages, userMessage];
    setMessages(prior);
    setInput('');
    setIsLoading(true);

    const historyForApi = prior
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));

    // Abort long-hanging requests so the UI recovers with a clear message
    const controller = new AbortController();
    const timeoutMs = 90_000;
    const timeoutId =
      typeof window !== 'undefined'
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    try {
      const res = await fetch('/api/bedrock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          messages: historyForApi,
          provider: 'bedrock',
          // Most Efficient ladder (Nova Lite → Haiku → Sonnet)
          model: 'auto',
          generalMode: true,
          useTools: true,
          assistantMode: false,
          pageContext: pageCtx.forModel,
        }),
      });

      // Never call res.json() directly — platform errors often return plain text
      const { data: result, errorMessage, nonJson } =
        await parseAiFetchResponse(res);

      if (errorMessage || result.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content:
              errorMessage ||
              String(result.message || result.error || 'Request failed'),
            timestamp: nowIso(),
          },
        ]);
        if (nonJson) {
          console.warn('[FloatingAi] non-JSON AI response', {
            status: res.status,
            snippet: result.rawSnippet,
          });
        }
      } else {
        const toolsUsed: string[] = Array.isArray(result.toolsUsed)
          ? (result.toolsUsed as string[])
          : [];
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content:
              (typeof result.response === 'string' && result.response) ||
              'No response generated.',
            timestamp: nowIso(),
            toolsUsed,
            modelLabel:
              (typeof result.modelLabel === 'string' && result.modelLabel) ||
              undefined,
          },
        ]);
        const crmMutated = result.crmMutated === true;
        if (
          crmMutated ||
          toolsUsed.some((t) => /^(create_|update_|link_)/.test(t))
        ) {
          void invalidateCrmCaches(queryClient, toolsUsed, {
            forceClients:
              crmMutated ||
              toolsUsed.some((t) => /company|contact|client/i.test(t)),
            forceAll: crmMutated,
          });
        }
      }
    } catch (err) {
      const msg = explainAiFetchError(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: msg,
          timestamp: nowIso(),
        },
      ]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  if (hideOnPage || !hydrated) return null;

  const suggestions = [
    pageCtx.entityType === 'candidate'
      ? 'Summarize this candidate and suggest next steps'
      : pageCtx.entityType === 'job'
        ? 'Who should I advance on this req?'
        : pageCtx.entityType === 'company'
          ? 'Draft outreach for this company'
          : 'What needs attention on my desk today?',
    'Update CRM based on my last note (confirm first)',
  ];

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-800 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          title="AI Assistant (Ctrl/⌘+J)"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close AI panel"
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  AI Assistant
                </h2>
                <p className="text-[11px] text-slate-500">
                  Same tools as full assistant · Esc to close · ⌘/Ctrl+J
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800">
                Context: {pageCtx.label}
                {pageCtx.entityId
                  ? ` · ${pageCtx.entityId.slice(0, 8)}…`
                  : ''}
              </span>
              {pageCtx.href && (
                <Link
                  href={pageCtx.href}
                  className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                >
                  Open page
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={startNewChat}
                disabled={isLoading}
                title="New chat"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Link
              href="/dashboard/general-ai-usage"
              className="inline-flex h-8 items-center rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100"
              title="Open full AI Assistant"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setOpen(false)}
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div className="mb-2 max-h-[40vh] overflow-hidden rounded-2xl">
            <AgentWorkbench variant="compact" />
          </div>
          {messages.length === 0 && (
            <div className="px-2 py-8 text-center">
              <Bot className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-800">
                How can I help?
              </p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                I can see you&apos;re on <strong>{pageCtx.label}</strong>
                {pageCtx.entityId ? ' detail' : ''}. Ask me to research, draft,
                or update CRM (writes ask for confirmation).
              </p>
              <div className="mt-4 flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Bot className="h-3.5 w-3.5 text-slate-600" />
                </div>
              )}
              <div
                className={`group relative max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-800 border border-slate-100'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {m.content}
                </div>
                <div
                  className={`mt-1 flex items-center gap-2 text-[10px] ${
                    m.role === 'user' ? 'text-slate-400' : 'text-slate-400'
                  }`}
                >
                  <span>{formatTime(m.timestamp)}</span>
                  {m.modelLabel && <span>· {m.modelLabel}</span>}
                  {m.toolsUsed && m.toolsUsed.length > 0 && (
                    <span className="truncate max-w-[8rem]">
                      · {m.toolsUsed.slice(0, 3).join(', ')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="ml-auto opacity-0 group-hover:opacity-100 transition"
                    onClick={() => void copyMessage(m.id, m.content)}
                    title="Copy"
                  >
                    {copiedId === m.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-slate-100 p-3 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={2}
              placeholder="Ask anything… (Enter to send)"
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !input.trim()}
              className="h-10 w-10 shrink-0 rounded-xl bg-slate-900 p-0 hover:bg-slate-800"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
