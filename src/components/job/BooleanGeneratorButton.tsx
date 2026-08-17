"use client";

import { useState } from "react";
import { Binary, Check, Copy, ExternalLink, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  fallbackBooleanStrings,
  indeedOpenUrls,
  isIndeedPlatform,
  type BooleanCache,
  type BooleanString,
} from "@/lib/sourcing/boolean-prompt";

type BooleanResponse = BooleanCache & {
  cached?: boolean;
  regenerated?: boolean;
  saved?: boolean;
  error?: string;
};

interface BooleanGeneratorButtonProps {
  jobId: string;
  jobTitle?: string;
  location?: string;
  tags?: string[];
  className?: string;
}

function platformTone(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("linkedin")) return "border-sky-200 bg-sky-50 text-sky-800";
  if (p.includes("indeed")) return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (p.includes("apollo")) return "border-amber-200 bg-amber-50 text-amber-800";
  if (p.includes("google")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function IndeedOpenActions({
  query,
  location,
}: {
  query: string;
  location?: string;
}) {
  const urls = indeedOpenUrls(query, location);
  const chars = query.length;
  const long = chars > 800;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <a
        href={urls.resumes}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-7 items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100"
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        Open Resumes
      </a>
      <a
        href={urls.jobs}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-7 items-center rounded-md border border-indigo-200 bg-white px-2 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50"
      >
        <ExternalLink className="mr-1 h-3 w-3" />
        Open Jobs
      </a>
      <span
        className={`text-[11px] ${long ? "font-medium text-amber-700" : "text-slate-400"}`}
      >
        {chars} chars
        {long ? " — trim toward 800 for Indeed" : ""}
        {location
          ? ` · Where: ${location}`
          : " · set location in Indeed's Where box"}
      </span>
    </div>
  );
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as BooleanResponse;
    return { res, data };
  } finally {
    window.clearTimeout(timer);
  }
}

export function BooleanGeneratorButton({
  jobId,
  jobTitle,
  location,
  tags,
  className,
}: BooleanGeneratorButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<BooleanResponse | null>(null);
  const [drafts, setDrafts] = useState<BooleanString[]>([]);
  const [dirty, setDirty] = useState(false);

  const applyPayload = (data: BooleanResponse) => {
    setResult(data);
    setDrafts(Array.isArray(data.strings) ? data.strings : []);
    setDirty(false);
  };

  const loadOrGenerate = async (regenerate = false) => {
    if (!jobId) {
      toast.error("Missing job id");
      return;
    }
    const instant = fallbackBooleanStrings({
      title: jobTitle,
      location,
      tags,
    });
    setOpen(true);
    if (regenerate) {
      setResult(null);
      setDirty(false);
    }
    if (instant.length) {
      setDrafts(instant);
      setResult({
        generatedAt: new Date().toISOString(),
        strings: instant,
        model: "instant-tags",
      });
    }
    setLoading(true);
    const url = `/api/jobs/${encodeURIComponent(jobId)}/boolean`;
    try {
      if (!regenerate) {
        const cached = await fetchJson(url, { method: "GET" }, 8000);
        if (cached.res.ok && cached.data.strings?.length) {
          applyPayload({ ...cached.data, cached: true });
          return;
        }
      }

      const posted = await fetchJson(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        },
        22000
      );
      if (!posted.res.ok) {
        throw new Error(posted.data.error || "Boolean Generator failed");
      }
      if (posted.data.strings?.length) {
        applyPayload(posted.data);
        if (regenerate) toast.success("Generated fresh Boolean strings");
      }
    } catch (e: unknown) {
      if (instant.length) {
        toast.message("Showing tag-based strings. Claude refine timed out — try Regenerate.");
        return;
      }
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const message = aborted
        ? "Boolean Generator timed out. Try again."
        : e instanceof Error
          ? e.message
          : "Failed to generate Boolean strings";
      toast.error(message);
      setResult({ generatedAt: "", strings: [], error: message });
    } finally {
      setLoading(false);
    }
  };

  const copyQuery = async (query: string, index: number) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedIndex(index);
      toast.success("Copied Boolean string");
      window.setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1400);
    } catch {
      toast.error("Could not copy");
    }
  };

  const updateDraft = (index: number, patch: Partial<BooleanString>) => {
    setDrafts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
    setDirty(true);
  };

  const saveEdits = async () => {
    if (!jobId || !drafts.length) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/boolean`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strings: drafts }),
      });
      const data = (await res.json().catch(() => ({}))) as BooleanResponse;
      if (!res.ok) throw new Error(data.error || "Save failed");
      applyPayload({ ...data, saved: true });
      toast.success("Saved Boolean strings on this job");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save edits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={
          className ||
          "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
        }
        onClick={() => void loadOrGenerate(false)}
        disabled={loading || !jobId}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Binary className="h-4 w-4 mr-2" />
        )}
        Boolean Generator
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Boolean Generator</DialogTitle>
            <DialogDescription>
              Ready-to-paste search strings for{" "}
              <span className="font-medium text-slate-700">
                {jobTitle || "this job"}
              </span>
              . Copy into LinkedIn Recruiter, Indeed Resume Search / Jobs, Apollo, or Google.
            </DialogDescription>
          </DialogHeader>

          {loading && !drafts.length ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              Building Boolean variants from the title, tags, and description…
            </div>
          ) : result?.error && !drafts.length ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {result.error}
            </div>
          ) : (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refining with Claude… you can copy these now.
                </div>
              ) : null}
              {drafts.map((row, index) => (
                <article
                  key={`${row.platform}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${platformTone(row.platform)}`}
                    >
                      {row.platform}
                    </span>
                    <input
                      value={row.label}
                      onChange={(e) => updateDraft(index, { label: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => void copyQuery(row.query, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <textarea
                    value={row.query}
                    onChange={(e) => updateDraft(index, { query: e.target.value })}
                    rows={isIndeedPlatform(row.platform) ? 4 : 3}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] leading-5 text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  {isIndeedPlatform(row.platform) && row.query.trim() ? (
                    <IndeedOpenActions query={row.query} location={location} />
                  ) : null}
                  <input
                    value={row.notes || ""}
                    onChange={(e) => updateDraft(index, { notes: e.target.value })}
                    placeholder="When to use this variant"
                    className="mt-2 w-full rounded-md border border-transparent bg-transparent px-1 text-xs text-slate-500 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                  />
                </article>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-slate-400">
                  {result?.cached
                    ? "Cached on this job — reopen is instant."
                    : result?.generatedAt
                      ? "Saved on this job for next time."
                      : ""}
                  {dirty ? " Unsaved edits." : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void saveEdits()}
                    disabled={saving || !dirty || !drafts.length}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save edits
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadOrGenerate(true)}
                    disabled={loading}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BooleanGeneratorButton;
