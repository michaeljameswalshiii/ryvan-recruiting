"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListColumnDef } from "@/lib/ui/use-list-columns";

type DataListTableProps = {
  minWidth?: number;
  children: ReactNode;
  className?: string;
};

/** Shared ATS list chrome: top scrollbar + vertical pane so Actions stay reachable. */
export function DataListTable({
  minWidth = 960,
  children,
  className = "",
}: DataListTableProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(minWidth);

  const measure = useCallback(() => {
    const table = innerRef.current?.querySelector("table");
    const w = Math.max(minWidth, table?.scrollWidth || minWidth);
    setScrollWidth(w);
  }, [minWidth]);

  useEffect(() => {
    measure();
    const table = innerRef.current?.querySelector("table");
    if (!table || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(table);
    return () => ro.disconnect();
  }, [measure, children]);

  const onTopScroll = () => {
    if (syncing.current || !bodyRef.current || !topRef.current) return;
    syncing.current = true;
    bodyRef.current.scrollLeft = topRef.current.scrollLeft;
    syncing.current = false;
  };

  const onBodyScroll = () => {
    if (syncing.current || !bodyRef.current || !topRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bodyRef.current.scrollLeft;
    syncing.current = false;
  };

  return (
    <div
      className={`bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden ${className}`}
    >
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="overflow-x-auto overflow-y-hidden border-b border-gray-100 bg-gray-50/80 [scrollbar-gutter:stable]"
        aria-label="Horizontal table scroll"
      >
        <div style={{ width: scrollWidth, height: 12 }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        className="overflow-auto max-h-[min(70vh,760px)]"
      >
        <div ref={innerRef} style={{ minWidth }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export const listTh =
  "text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 sticky top-0 z-[8]";

export const listThRight =
  "text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 sticky top-0 right-0 z-[12] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] min-w-[5.5rem]";

export const listThCheck =
  "sticky top-0 left-0 z-[12] bg-gray-50 text-left px-3 py-3 w-10";

export const listThName =
  "sticky top-0 left-10 z-[11] bg-gray-50 text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 min-w-[13rem]";

/** Frozen identity header when the table has no checkbox column. */
export const listThNameFlush =
  "sticky top-0 left-0 z-[11] bg-gray-50 text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 min-w-[13rem]";

export const listTd = "px-4 py-3.5";

export function listTdCheck(selected: boolean) {
  return `sticky left-0 z-[5] px-3 py-3.5 align-middle ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdName(selected: boolean) {
  return `sticky left-10 z-[5] px-4 py-3.5 min-w-[13rem] ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdNameFlush(selected = false) {
  return `sticky left-0 z-[5] px-4 py-3.5 min-w-[13rem] ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdActions(selected: boolean) {
  return `sticky right-0 z-10 px-3 py-3.5 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

type PickerProps<Id extends string> = {
  defs: ListColumnDef<Id>[];
  order: Id[];
  col: (id: Id) => boolean;
  toggle: (id: Id) => void;
  move: (id: Id, dir: -1 | 1) => void;
  reset: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  alwaysOnNote?: string;
};

export function ListColumnPicker<Id extends string>({
  defs,
  order,
  col,
  toggle,
  move,
  reset,
  open,
  setOpen,
  alwaysOnNote = "Name and Actions always stay on.",
}: PickerProps<Id>) {
  const byId = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<
    Id,
    ListColumnDef<Id>
  >;
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Choose which columns appear and in what order"
      >
        <Columns3 className="mr-1.5 h-4 w-4" />
        Columns
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close columns menu"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-slate-900"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Columns
              </p>
              <button
                type="button"
                onClick={reset}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Reset
              </button>
            </div>
            <p className="mb-2 text-[11px] text-slate-500">{alwaysOnNote}</p>
            <ul className="space-y-1">
              {order.map((id, index) => {
                const def = byId[id];
                if (!def) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={col(id)}
                        onChange={() => toggle(id)}
                      />
                      <span className="truncate text-slate-800">{def.label}</span>
                    </label>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                      aria-label={`Move ${def.label} earlier`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={index === order.length - 1}
                      onClick={() => move(id, 1)}
                      aria-label={`Move ${def.label} later`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
