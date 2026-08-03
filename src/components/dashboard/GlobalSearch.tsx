"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  UserRound,
  Building2,
  Contact,
  Briefcase,
  X,
} from "lucide-react";

type SearchHit = {
  id: string;
  type: "candidate" | "company" | "contact" | "job";
  title: string;
  subtitle?: string;
  href: string;
};

const TYPE_META: Record<
  SearchHit["type"],
  { label: string; icon: typeof UserRound; order: number }
> = {
  candidate: { label: "Candidates", icon: UserRound, order: 0 },
  company: { label: "Companies", icon: Building2, order: 1 },
  contact: { label: "Contacts", icon: Contact, order: 2 },
  job: { label: "Jobs", icon: Briefcase, order: 3 },
};

function groupHits(hits: SearchHit[]) {
  const groups: { type: SearchHit["type"]; items: SearchHit[] }[] = [];
  const map = new Map<SearchHit["type"], SearchHit[]>();
  for (const h of hits) {
    if (!map.has(h.type)) map.set(h.type, []);
    map.get(h.type)!.push(h);
  }
  const types = [...map.keys()].sort(
    (a, b) => TYPE_META[a].order - TYPE_META[b].order
  );
  for (const t of types) {
    groups.push({ type: t, items: map.get(t)! });
  }
  return groups;
}

export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const flatResults = results;

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&limit=24`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        setResults([]);
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
      setActiveIndex(-1);
    } catch {
      setError("Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Ctrl/Cmd+K focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        flatResults.length === 0 ? -1 : Math.min(i + 1, flatResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        go(flatResults[activeIndex]);
      } else if (flatResults[0]) {
        go(flatResults[0]);
      } else if (query.trim().length >= 2) {
        // Fallback: open candidates list with q
        setOpen(false);
        router.push(
          `/dashboard/candidates?q=${encodeURIComponent(query.trim())}`
        );
      }
    }
  };

  const showPanel =
    open && (query.trim().length >= 2 || loading || results.length > 0);
  const groups = groupHits(results);
  let runningIndex = -1;

  return (
    <div ref={rootRef} className="relative w-full max-w-md flex-1 min-w-0">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search candidates, companies, jobs..."
        className="w-full h-10 pl-10 pr-16 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !loading && (
          <button
            type="button"
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[min(420px,70vh)] overflow-y-auto rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-lg"
        >
          {query.trim().length < 2 && (
            <p className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
              Type at least 2 characters to search.
            </p>
          )}

          {query.trim().length >= 2 && error && (
            <p className="px-3 py-3 text-sm text-rose-600">{error}</p>
          )}

          {query.trim().length >= 2 &&
            !loading &&
            !error &&
            results.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
                No matches for &ldquo;{query.trim()}&rdquo;
              </p>
            )}

          {groups.map((group) => {
            const meta = TYPE_META[group.type];
            const Icon = meta.icon;
            return (
              <div key={group.type} className="border-b border-gray-100 dark:border-border last:border-0">
                <div className="sticky top-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-gray-50/95 dark:bg-secondary/95 backdrop-blur">
                  {meta.label}
                </div>
                <ul className="py-1">
                  {group.items.map((hit) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <li key={`${hit.type}-${hit.id}`}>
                        <button
                          type="button"
                          id={`${listId}-opt-${idx}`}
                          role="option"
                          aria-selected={active}
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                            active
                              ? "bg-blue-50 dark:bg-blue-500/15"
                              : "hover:bg-gray-50 dark:hover:bg-white/5"
                          }`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => go(hit)}
                        >
                          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-500 dark:text-slate-300" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-900 dark:text-slate-50 truncate">
                              {hit.title}
                            </span>
                            {hit.subtitle ? (
                              <span className="block text-xs text-slate-600 dark:text-slate-300 truncate">
                                {hit.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
