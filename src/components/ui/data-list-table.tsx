"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Columns3, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  move?: (id: Id, dir: -1 | 1) => void;
  reorder?: (ids: Id[]) => void;
  reset: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  alwaysOnNote?: string;
};

function SortableColumnRow<Id extends string>({
  id,
  label,
  checked,
  isNew,
  onToggle,
}: {
  id: Id;
  label: string;
  checked: boolean;
  isNew?: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
        isDragging
          ? "z-10 border-blue-200 bg-blue-50 shadow-sm"
          : checked
            ? "border-transparent bg-white hover:bg-slate-50"
            : "border-transparent bg-slate-50/80 hover:bg-slate-50"
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        aria-label={`Drag ${label} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={checked}
          onChange={onToggle}
        />
        <span
          className={`truncate ${checked ? "text-slate-800" : "text-slate-400 line-through"}`}
        >
          {label}
        </span>
      </label>
      {isNew && checked ? (
        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          New
        </span>
      ) : null}
      {!checked ? (
        <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
          Hidden
        </span>
      ) : null}
    </li>
  );
}

export function ListColumnPicker<Id extends string>({
  defs,
  order,
  col,
  toggle,
  reorder,
  reset,
  open,
  setOpen,
  alwaysOnNote = "Name and Actions always stay on. Drag the handle to change order.",
}: PickerProps<Id>) {
  const byId = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<
    Id,
    ListColumnDef<Id>
  >;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !reorder) return;
    const oldIndex = order.indexOf(active.id as Id);
    const newIndex = order.indexOf(over.id as Id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorder(arrayMove(order, oldIndex, newIndex));
  };

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
            className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-slate-900"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Edit columns</p>
              <button
                type="button"
                onClick={reset}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Reset
              </button>
            </div>
            <p className="mb-3 text-[11px] text-slate-500">
              Drag to reorder columns. {alwaysOnNote}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {order.map((id) => {
                    const def = byId[id];
                    if (!def) return null;
                    return (
                      <SortableColumnRow
                        key={id}
                        id={id}
                        label={def.label}
                        checked={col(id)}
                        isNew={def.isNew}
                        onToggle={() => toggle(id)}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        </>
      )}
    </div>
  );
}
