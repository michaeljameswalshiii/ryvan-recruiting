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

/** Same page shell for companies / candidates / contacts / jobs. */
export const LIST_PAGE_CLASS = "w-full min-w-0 max-w-none space-y-5";

export const LIST_TABLE_CLASS =
  "w-full table-fixed border-separate border-spacing-0";

export const LIST_ACTIONS_WIDTH_PX = 88;

type DataListTableProps = {
  children: ReactNode;
  className?: string;
};

/** Shared ATS list chrome: one full-width pane, Actions lane reserved. */
export function DataListTable({
  children,
  className = "",
}: DataListTableProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowX, setOverflowX] = useState(false);

  const measure = useCallback(() => {
    const body = bodyRef.current;
    const table = innerRef.current?.querySelector("table");
    if (!body || !table) return;
    const sw = table.scrollWidth;
    setScrollWidth(sw);
    setOverflowX(sw > body.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    const table = innerRef.current?.querySelector("table");
    const body = bodyRef.current;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (table) ro.observe(table);
    if (body) ro.observe(body);
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
      className={`w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden ${className}`}
    >
      {overflowX ? (
        <div
          ref={topRef}
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden border-b border-gray-100 bg-gray-50/80"
          aria-label="Horizontal table scroll"
        >
          <div style={{ width: scrollWidth, height: 12 }} />
        </div>
      ) : null}
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        className="w-full overflow-auto max-h-[min(70vh,760px)] [scrollbar-gutter:stable]"
      >
        <div ref={innerRef} className="w-full">
          {children}
        </div>
      </div>
    </div>
  );
}

export const listTh =
  "text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 sticky top-0 z-[8] overflow-hidden";

export const listThRight =
  "text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 sticky top-0 right-0 z-[12] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem]";

export const listThCheck =
  "sticky top-0 left-0 z-[12] bg-gray-50 text-left px-3 py-3 w-10 min-w-10 max-w-10";

export const listThName =
  "sticky top-0 left-10 z-[11] bg-gray-50 text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[13rem] min-w-[13rem] overflow-hidden";

/** Frozen identity header when the table has no checkbox column. */
export const listThNameFlush =
  "sticky top-0 left-0 z-[11] bg-gray-50 text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[13rem] min-w-[13rem] overflow-hidden";

export const listTd = "px-4 py-3.5 overflow-hidden";

export function listTdCheck(selected: boolean) {
  return `sticky left-0 z-[5] px-3 py-3.5 align-middle w-10 min-w-10 max-w-10 ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdName(selected: boolean) {
  return `sticky left-10 z-[5] px-4 py-3.5 w-[13rem] min-w-[13rem] overflow-hidden ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdNameFlush(selected = false) {
  return `sticky left-0 z-[5] px-4 py-3.5 w-[13rem] min-w-[13rem] overflow-hidden ${
    selected ? "bg-blue-50/90" : "bg-white group-hover:bg-gray-50"
  }`;
}

export function listTdActions(selected: boolean) {
  return `sticky right-0 z-10 px-3 py-3.5 text-right w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] ${
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
