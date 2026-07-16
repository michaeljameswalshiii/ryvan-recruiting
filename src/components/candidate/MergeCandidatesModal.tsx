"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Combine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeads } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Candidate currently open (one side of the merge) */
  currentCandidate: {
    id: string;
    name: string;
    email?: string;
    createdAt?: string;
  };
};

type PreviewRow = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  status?: string;
  source?: string;
  createdAt?: string;
  resumeUrl?: string;
  linkedJobCount: number;
};

function formatCreated(iso?: string) {
  if (!iso) return "Unknown date";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function MergeCandidatesModal({
  open,
  onClose,
  currentCandidate,
}: Props) {
  const router = useRouter();
  const { data: leadsRaw, isLoading: loadingList } = useLeads();
  const [search, setSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string>(currentCandidate.id);
  const [preview, setPreview] = useState<{
    a: PreviewRow;
    b: PreviewRow;
    suggestedPrimaryId: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);

  const candidates = useMemo(() => {
    const list = Array.isArray(leadsRaw)
      ? leadsRaw
      : Array.isArray((leadsRaw as any)?.leads)
        ? (leadsRaw as any).leads
        : [];
    return list.filter((c: any) => c?.id && c.id !== currentCandidate.id);
  }, [leadsRaw, currentCandidate.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 40);
    return candidates
      .filter((c: any) => {
        const hay = [c.name, c.email, c.phone, c.title, c.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [candidates, search]);

  useEffect(() => {
    if (!open) {
      setOtherId(null);
      setPreview(null);
      setSearch("");
      setPrimaryId(currentCandidate.id);
    }
  }, [open, currentCandidate.id]);

  useEffect(() => {
    if (!open || !otherId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    fetch(
      `/api/candidate/merge?a=${encodeURIComponent(currentCandidate.id)}&b=${encodeURIComponent(otherId)}`,
      { credentials: "include" }
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Preview failed");
        if (cancelled) return;
        setPreview({
          a: data.a,
          b: data.b,
          suggestedPrimaryId: data.suggestedPrimaryId,
        });
        setPrimaryId(data.suggestedPrimaryId || currentCandidate.id);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || "Failed to load merge preview");
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, otherId, currentCandidate.id]);

  const secondaryId =
    preview && primaryId === preview.a.id ? preview.b.id : preview?.a.id;

  const onMerge = async () => {
    if (!primaryId || !secondaryId) return;
    if (
      !confirm(
        "Merge these candidates? The non-primary record will be permanently deleted after its data is combined into the primary. This cannot be undone."
      )
    ) {
      return;
    }
    setMerging(true);
    try {
      const res = await fetch("/api/candidate/merge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, secondaryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Merge failed");
      toast.success(
        `Merged successfully${
          data.stats
            ? ` · ${data.stats.jobsMerged} jobs, ${data.stats.eventsMoved} activities moved`
            : ""
        }`
      );
      onClose();
      // Navigate to survivor (may already be on this page)
      router.push(`/dashboard/candidates/${primaryId}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !merging && onClose()}
      />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Combine className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Merge candidates
              </h2>
              <p className="text-xs text-gray-500">
                Combine a duplicate into one record. Choose which to keep as
                primary (suggested: older by date created).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => !merging && onClose()}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Current candidate
            </div>
            <div className="mt-1 font-medium text-slate-900">
              {currentCandidate.name}
            </div>
            <div className="text-xs text-slate-500">
              {currentCandidate.email || "No email"} · Created{" "}
              {formatCreated(currentCandidate.createdAt)}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-800">
              Select duplicate to merge
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone…"
              className="mt-1.5 bg-white"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200">
              {loadingList ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">
                  No other candidates found
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filtered.map((c: any) => {
                    const selected = otherId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setOtherId(c.id)}
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-blue-50/60 ${
                            selected ? "bg-blue-50" : ""
                          }`}
                        >
                          <span
                            className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${
                              selected
                                ? "border-blue-600 bg-blue-600"
                                : "border-gray-300"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-gray-900 block truncate">
                              {c.name || "Unnamed"}
                            </span>
                            <span className="text-xs text-gray-500 block truncate">
                              {c.email || c.phone || c.title || c.id}
                              {c.created_at || c.createdAt
                                ? ` · ${formatCreated(c.created_at || c.createdAt)}`
                                : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {otherId && (
            <div>
              <div className="mb-2 text-sm font-medium text-gray-800">
                Choose primary record
              </div>
              <p className="mb-3 text-xs text-gray-500">
                The primary keeps its ID and URL. Empty fields are filled from
                the other record; jobs and activity history are combined. The
                non-primary is deleted.
              </p>
              {loadingPreview || !preview ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[preview.a, preview.b].map((row) => {
                    const isPrimary = primaryId === row.id;
                    const isSuggested =
                      preview.suggestedPrimaryId === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setPrimaryId(row.id)}
                        className={`rounded-xl border p-4 text-left transition ${
                          isPrimary
                            ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-200"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {row.name}
                          </span>
                          {isSuggested && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                              Older · suggested
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                          <div>
                            <span className="text-gray-400">Created: </span>
                            {formatCreated(row.createdAt)}
                          </div>
                          <div className="truncate">
                            <span className="text-gray-400">Email: </span>
                            {row.email || "—"}
                          </div>
                          <div className="truncate">
                            <span className="text-gray-400">Source: </span>
                            {row.source || "—"}
                          </div>
                          <div>
                            <span className="text-gray-400">Jobs: </span>
                            {row.linkedJobCount}
                            {row.resumeUrl ? " · Has resume" : ""}
                          </div>
                        </div>
                        <div className="mt-3 text-xs font-medium text-blue-700">
                          {isPrimary
                            ? "✓ Keep as primary"
                            : "Use as primary"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-100 bg-white px-5 py-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={merging}
          >
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!preview || !primaryId || !secondaryId || merging}
            onClick={() => void onMerge()}
          >
            {merging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging…
              </>
            ) : (
              <>
                <Combine className="mr-2 h-4 w-4" />
                Merge into primary
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
