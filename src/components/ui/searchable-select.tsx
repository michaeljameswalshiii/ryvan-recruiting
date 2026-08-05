'use client';

/**
 * Searchable select / typeahead for long entity lists (companies, contacts, jobs…).
 * Type to filter; click or Enter to pick. Works inside modals.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text included in search (e.g. location, email) */
  keywords?: string;
  description?: string;
};

export type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  /** Allow clearing selection */
  allowClear?: boolean;
  /** Max height of the dropdown list */
  listMaxHeight?: number;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function matchesQuery(opt: SearchableSelectOption, q: string) {
  if (!q) return true;
  const hay = normalize(
    `${opt.label} ${opt.keywords || ''} ${opt.description || ''}`
  );
  return hay.includes(q);
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyMessage = 'No matches',
  disabled = false,
  required = false,
  id,
  className,
  allowClear = true,
  listMaxHeight = 260,
}: SearchableSelectProps) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    const list = options.filter((o) => matchesQuery(o, q));
    // Keep selected visible at top when no query
    if (!q && selected) {
      const rest = list.filter((o) => o.value !== selected.value);
      return [selected, ...rest];
    }
    return list;
  }, [options, query, selected]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = useCallback(
    (v: string) => {
      onValueChange(v);
      setOpen(false);
      setQuery('');
    },
    [onValueChange]
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      {/* Native required support for form submit */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          value={value}
          onChange={() => {}}
          required
        />
      ) : null}

      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-muted-foreground'
        )}
      >
        <span className="truncate text-left flex-1">
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange('');
                }
              }}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[80] rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            className="overflow-y-auto py-1"
            style={{ maxHeight: listMaxHeight }}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHi = i === highlight;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                      isHi && 'bg-accent text-accent-foreground',
                      isSelected && !isHi && 'bg-muted/60'
                    )}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      // prevent blur before click
                      e.preventDefault();
                      pick(opt.value);
                    }}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {opt.label}
                      </span>
                      {opt.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
          {options.length > 8 ? (
            <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              {filtered.length} of {options.length}
              {query ? ' matching' : ''}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Build sorted company options from client/company records. */
export function companyOptionsFromList(
  companies: Array<Record<string, unknown> | any>
): SearchableSelectOption[] {
  return [...(companies || [])]
    .map((c) => {
      const value = String(c?.id || c?.PK || '');
      const label = String(c?.name || c?.companyName || value || 'Company');
      const loc = String(c?.location || c?.city || c?.hq_location || '');
      return {
        value,
        label,
        description: loc || undefined,
        keywords: [label, loc, c?.industry, c?.domain, c?.website]
          .filter(Boolean)
          .join(' '),
      };
    })
    .filter((o) => o.value)
    .sort((a, b) => a.label.localeCompare(b.label));
}
