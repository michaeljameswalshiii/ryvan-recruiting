"use client";

import { useQuery } from "@tanstack/react-query";

export type AssignmentOwner = {
  name: string;
  email?: string;
  userId?: string;
};

export function useAssignmentOwners(
  objectType: "candidate" | "company" | "job" | "contact"
) {
  return useQuery({
    queryKey: ["object-assignment-owners", objectType],
    queryFn: async () => {
      const res = await fetch(
        `/api/object-assignments/summary?objectType=${objectType}`,
        { credentials: "include", cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      return (body.owners || {}) as Record<string, AssignmentOwner>;
    },
    staleTime: 30_000,
  });
}
