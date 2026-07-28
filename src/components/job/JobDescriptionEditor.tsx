'use client';

/**
 * Rich job description editor: bold / italic / lists + Google Docs paste + live preview.
 * Stores sanitized HTML (falls back to plain text for legacy jobs).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading3,
  Eye,
  Pencil,
  RemoveFormatting,
  Underline,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobDescription } from '@/components/careers/JobDescription';
import {
  looksLikeHtml,
  plainTextToJobHtml,
  sanitizeJobHtml,
} from '@/lib/careers/sanitize-job-html';
import { normalizeJobDescriptionPaste } from '@/lib/careers/format-description';
import { toast } from 'sonner';

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Focus the editable region when true */
  autoFocus?: boolean;
  className?: string;
};

function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value);
  } catch {
    /* ignore */
  }
}

export function JobDescriptionEditor({
  id = 'job-description-editor',
  value,
  onChange,
  placeholder = 'Paste from Google Docs or Word — formatting is preserved. Use the toolbar for bold, italics, and lists.',
  minHeight = 220,
  autoFocus = false,
  className = '',
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [focused, setFocused] = useState(false);

  // Sync external value → editor when not typing
  useEffect(() => {
    const el = editorRef.current;
    if (!el || mode !== 'edit') return;
    if (value === lastEmitted.current) return;
    // Avoid clobbering while focused with local edits
    if (focused && el.innerHTML && value === lastEmitted.current) return;

    const html = looksLikeHtml(value)
      ? sanitizeJobHtml(value)
      : plainTextToJobHtml(value || '');
    if (el.innerHTML !== html) {
      el.innerHTML = html || '';
    }
    lastEmitted.current = value;
  }, [value, mode, focused]);

  // Initial mount
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = looksLikeHtml(value)
      ? sanitizeJobHtml(value)
      : plainTextToJobHtml(value || '');
    el.innerHTML = html || '';
    lastEmitted.current = value;
    if (autoFocus) {
      el.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = el.innerHTML;
    // Empty editor
    const text = (el.innerText || '').replace(/\u00a0/g, ' ').trim();
    const next = text ? sanitizeJobHtml(raw) : '';
    lastEmitted.current = next;
    onChange(next);
  }, [onChange]);

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html =
      e.clipboardData.getData('text/html') ||
      e.clipboardData.getData('text/plain') ||
      '';
    if (!html.trim()) return;

    let cleaned: string;
    if (html.includes('<') && /<\/?[a-z]/i.test(html)) {
      cleaned = sanitizeJobHtml(html);
    } else {
      // Plain paste → normalize structure then HTML
      cleaned = plainTextToJobHtml(normalizeJobDescriptionPaste(html));
    }
    if (!cleaned) return;

    // Insert at caret
    try {
      document.execCommand('insertHTML', false, cleaned);
    } catch {
      const el = editorRef.current;
      if (el) {
        el.innerHTML = (el.innerHTML || '') + cleaned;
      }
    }
    emit();
  };

  const run = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    exec(cmd, val);
    emit();
  };

  const cleanAll = () => {
    const el = editorRef.current;
    if (!el) return;
    const plain = normalizeJobDescriptionPaste(
      (el.innerText || '').replace(/\u00a0/g, ' ')
    );
    const html = plainTextToJobHtml(plain);
    el.innerHTML = html;
    lastEmitted.current = html;
    onChange(html);
    toast.success('Description cleaned (structure preserved as headings & bullets)');
  };

  const empty =
    !value ||
    !String(value)
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

  return (
    <div className={`rounded-lg border border-input bg-background ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        <ToolbarBtn
          title="Bold"
          onClick={() => run('bold')}
          disabled={mode === 'preview'}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Italic"
          onClick={() => run('italic')}
          disabled={mode === 'preview'}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Underline"
          onClick={() => run('underline')}
          disabled={mode === 'preview'}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn
          title="Bullet list"
          onClick={() => run('insertUnorderedList')}
          disabled={mode === 'preview'}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Numbered list"
          onClick={() => run('insertOrderedList')}
          disabled={mode === 'preview'}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Section heading"
          onClick={() => run('formatBlock', 'h3')}
          disabled={mode === 'preview'}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn
          title="Clean formatting (headings & bullets)"
          onClick={cleanAll}
          disabled={mode === 'preview' || empty}
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant={mode === 'edit' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              emit();
              setMode('edit');
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button
            type="button"
            variant={mode === 'preview' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              emit();
              setMode('preview');
            }}
          >
            <Eye className="h-3 w-3" />
            Preview job
          </Button>
        </div>
      </div>

      {mode === 'edit' ? (
        <div className="relative">
          {empty && !focused && (
            <div
              className="pointer-events-none absolute left-3 right-3 top-3 text-sm text-muted-foreground"
              aria-hidden
            >
              {placeholder}
            </div>
          )}
          <div
            id={id}
            ref={editorRef}
            role="textbox"
            aria-multiline
            aria-label="Job description"
            contentEditable
            suppressContentEditableWarning
            className="job-desc-editor max-h-[min(60vh,480px)] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-slate-800 outline-none focus-visible:ring-0"
            style={{ minHeight }}
            onInput={emit}
            onBlur={() => {
              setFocused(false);
              emit();
            }}
            onFocus={() => setFocused(true)}
            onPaste={onPaste}
          />
        </div>
      ) : (
        <div className="max-h-[min(60vh,480px)] overflow-y-auto bg-slate-50 px-4 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Careers page preview
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <JobDescription description={value || ''} />
          </div>
        </div>
      )}

      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Paste from Google Docs or Word keeps bold, italics, and bullets. Preview shows how
        the public careers posting will look.
      </p>
    </div>
  );
}

function ToolbarBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        // Keep selection in editor
        e.preventDefault();
        onClick();
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
