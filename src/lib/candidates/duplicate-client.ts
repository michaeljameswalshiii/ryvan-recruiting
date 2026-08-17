import type {
  DuplicateMatch,
  IncomingCandidateInput,
} from "@/lib/candidates/duplicates";

export type DuplicateCheckResponse = {
  matches: DuplicateMatch[];
};

export type ResolveDuplicateResponse = {
  success: boolean;
  action: "create" | "merge";
  primaryId: string;
  secondaryId?: string;
  candidate?: { id?: string };
  stats?: { fieldsFilled?: number; jobsMerged?: number; eventsMoved?: number };
  error?: string;
  matches?: DuplicateMatch[];
  code?: string;
};

export async function checkCandidateDuplicates(
  incoming: IncomingCandidateInput
): Promise<DuplicateMatch[]> {
  const res = await fetch("/api/candidate/duplicates", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(incoming),
  });
  const data = (await res.json().catch(() => ({}))) as DuplicateCheckResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Failed to check for duplicates");
  }
  return Array.isArray(data.matches) ? data.matches : [];
}

export async function resolveDuplicateCandidate(input: {
  action: "create" | "merge";
  primary: "existing" | "incoming";
  existingId?: string;
  incoming: Record<string, unknown>;
}): Promise<ResolveDuplicateResponse> {
  const res = await fetch("/api/candidate/resolve-duplicate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as ResolveDuplicateResponse;
  if (!res.ok) {
    const err = new Error(data.error || "Failed to resolve duplicate") as Error & {
      matches?: DuplicateMatch[];
      code?: string;
    };
    err.matches = data.matches;
    err.code = data.code;
    throw err;
  }
  return data;
}

export function matchesFromCreateError(data: {
  code?: string;
  matches?: DuplicateMatch[];
}): DuplicateMatch[] | null {
  if (data?.code === "DUPLICATE_CANDIDATE" && Array.isArray(data.matches)) {
    return data.matches;
  }
  return null;
}
