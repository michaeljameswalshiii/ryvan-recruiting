'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const DEFAULT_PREVIEW_CHARS = 160;
const DEFAULT_PREVIEW_LINES = 3;

/**
 * Compact activity note body: collapsed by default when long,
 * with Show more / Show less toggle.
 */
export function ExpandableNoteText({
  text,
  previewChars = DEFAULT_PREVIEW_CHARS,
  className = '',
}: {
  text?: string | null;
  previewChars?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const raw = String(text ?? '').trim();
  const isEmpty = !raw || raw === '—';

  const needsCollapse = useMemo(() => {
    if (isEmpty) return false;
    const lines = raw.split(/\r?\n/).length;
    return raw.length > previewChars || lines > DEFAULT_PREVIEW_LINES;
  }, [raw, previewChars, isEmpty]);

  if (isEmpty) {
    return <span className="text-gray-400">—</span>;
  }

  if (!needsCollapse) {
    return (
      <div
        className={`text-sm text-gray-800 whitespace-pre-wrap break-words ${className}`}
      >
        {raw}
      </div>
    );
  }

  // Prefer first few lines for preview when multi-line
  let preview = raw;
  if (!expanded) {
    const lines = raw.split(/\r?\n/);
    if (lines.length > DEFAULT_PREVIEW_LINES) {
      preview = lines.slice(0, DEFAULT_PREVIEW_LINES).join('\n');
      if (preview.length > previewChars) {
        preview = preview.slice(0, previewChars).trimEnd() + '…';
      } else if (preview.length < raw.length) {
        preview = preview.trimEnd() + '…';
      }
    } else if (raw.length > previewChars) {
      preview = raw.slice(0, previewChars).trimEnd() + '…';
    }
  }

  return (
    <div className={`min-w-0 max-w-xl ${className}`}>
      <div
        className={`rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words ${
          expanded ? 'max-h-72 overflow-y-auto' : ''
        }`}
      >
        {expanded ? raw : preview}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
      >
        {expanded ? (
          <>
            Show less <ChevronUp className="h-3 w-3" />
          </>
        ) : (
          <>
            Show more <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
    </div>
  );
}
