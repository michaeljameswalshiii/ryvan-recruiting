"use client";

import { useQuery } from "@tanstack/react-query";

export type AssignmentOwner = {
  name: string;
  email?: string;
  userId?: string;
};

export function useAssignmentOwners(
  objectType: "candidate" | "company" | "job" | "contact",
  objectIds?: string[],
) {
  const ids = (objectIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .slice(0, 400);
  const idsKey = ids.slice().sort().join(",");

  return useQuery({
    queryKey: ["object-assignment-owners", objectType, idsKey],
    queryFn: async () => {
      const params = new URLSearchParams({ objectType });
      for (const id of ids) params.append("id", id);
      const res = await fetch(
        `/api/object-assignments/summary?${params.toString()}`,
        { credentials: "include", cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      return (body.owners || {}) as Record<string, AssignmentOwner>;
    },
    staleTime: 30_000,
  });
}
