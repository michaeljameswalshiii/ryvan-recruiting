"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type ListColumnDef<Id extends string> = {
  id: Id;
  label: string;
  defaultOn: boolean;
};

export function useListColumns<Id extends string>(
  storageKey: string,
  defs: ListColumnDef<Id>[]
) {
  const defaultVisibility = useMemo(
    () =>
      Object.fromEntries(defs.map((d) => [d.id, d.defaultOn])) as Record<
        Id,
        boolean
      >,
    [defs]
  );
  const defaultOrder = useMemo(() => defs.map((d) => d.id), [defs]);

  const [visibility, setVisibility] =
    useState<Record<Id, boolean>>(defaultVisibility);
  const [order, setOrder] = useState<Id[]>(defaultOrder);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        visibility?: Partial<Record<Id, boolean>>;
        order?: Id[];
      };
      if (parsed.visibility) {
        setVisibility({ ...defaultVisibility, ...parsed.visibility });
      }
      if (Array.isArray(parsed.order)) {
        const known = new Set(defaultOrder);
        const next = parsed.order.filter((id) => known.has(id));
        for (const id of defaultOrder) {
          if (!next.includes(id)) next.push(id);
        }
        setOrder(next);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, defaultOrder, defaultVisibility]);

  const persist = useCallback(
    (nextVis: Record<Id, boolean>, nextOrder: Id[]) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ visibility: nextVis, order: nextOrder })
        );
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const col = useCallback(
    (id: Id) => visibility[id] !== false,
    [visibility]
  );

  const toggle = useCallback(
    (id: Id) => {
      setVisibility((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        persist(next, order);
        return next;
      });
    },
    [order, persist]
  );

  const move = useCallback(
    (id: Id, dir: -1 | 1) => {
      setOrder((prev) => {
        const i = prev.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(i, 1);
        next.splice(j, 0, item);
        persist(visibility, next);
        return next;
      });
    },
    [persist, visibility]
  );

  const reset = useCallback(() => {
    setVisibility(defaultVisibility);
    setOrder(defaultOrder);
    persist(defaultVisibility, defaultOrder);
  }, [defaultOrder, defaultVisibility, persist]);

  const visibleIds = useMemo(
    () => order.filter((id) => visibility[id] !== false),
    [order, visibility]
  );

  return {
    defs,
    order,
    visibility,
    visibleIds,
    col,
    toggle,
    move,
    reset,
    open,
    setOpen,
  };
}
