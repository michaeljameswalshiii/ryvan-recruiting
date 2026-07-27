'use client';

/**
 * AI conversation history drawer — timestamps, most-recent spotlight, open/delete.
 */

import {
  History,
  Clock,
  Trash2,
  Sparkles,
  MessageSquare,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type ChatHistoryThread,
  formatThreadWhen,
} from '@/lib/ai/chat-history';

type Props = {
  open: boolean;
  onClose: () => void;
  threads: ChatHistoryThread[];
  activeThreadId?: string | null;
  onSelect: (thread: ChatHistoryThread) => void;
  onDelete: (threadId: string) => void;
  onClearAll?: () => void;
  loading?: boolean;
};

export function ChatHistoryPanel({
  open,
  onClose,
  threads,
  activeThreadId,
  onSelect,
  onDelete,
  onClearAll,
  loading,
}: Props) {
  if (!open) return null;

  const [mostRecent, ...rest] = threads;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        aria-label="Close history"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Chat history
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Returning to AI Assistant starts a new chat. Open a prior
              conversation anytime.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                No saved conversations yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Send a message and it will appear here with a date and time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mostRecent && (
                <section>
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    Most recent
                  </p>
                  <ThreadCard
                    thread={mostRecent}
                    featured
                    active={activeThreadId === mostRecent.id}
                    onSelect={() => onSelect(mostRecent)}
                    onDelete={() => onDelete(mostRecent.id)}
                  />
                </section>
              )}

              {rest.length > 0 && (
                <section>
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Earlier
                  </p>
                  <ul className="space-y-2">
                    {rest.map((t) => (
                      <li key={t.id}>
                        <ThreadCard
                          thread={t}
                          active={activeThreadId === t.id}
                          onSelect={() => onSelect(t)}
                          onDelete={() => onDelete(t.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        {threads.length > 0 && onClearAll && (
          <footer className="border-t border-slate-100 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => {
                if (
                  confirm(
                    'Delete all saved AI conversations on this browser? This cannot be undone.'
                  )
                ) {
                  onClearAll();
                }
              }}
            >
              Clear all history
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function ThreadCard({
  thread,
  featured,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChatHistoryThread;
  featured?: boolean;
  active?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const when = formatThreadWhen(thread.updatedAt);
  const created = formatThreadWhen(thread.createdAt);
  const msgCount = thread.messages.length;

  return (
    <div
      className={`group rounded-xl border p-3 transition ${
        featured
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white shadow-sm ring-1 ring-emerald-100'
          : active
            ? 'border-blue-200 bg-blue-50/40'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2">
          {featured ? (
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : (
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 line-clamp-2">
              {thread.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              <span
                className="inline-flex items-center gap-1"
                title={when.absolute}
              >
                <Clock className="h-3 w-3" />
                {when.relative}
              </span>
              <span className="text-slate-300">·</span>
              <span title={`Started ${created.absolute}`}>
                {when.absolute}
              </span>
              <span className="text-slate-300">·</span>
              <span>
                {msgCount} message{msgCount === 1 ? '' : 's'}
              </span>
              {thread.lastModelLabel && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">{thread.lastModelLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </button>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this conversation from history?')) onDelete();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-400 opacity-70 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
