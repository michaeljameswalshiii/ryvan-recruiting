"use client";

import { useState, useEffect } from "react";
import { Loader2, X, Search, Briefcase, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useJobs } from "@/lib/hooks/query-job";
import { toast } from "sonner";

export type LinkedJobSummary = {
  jobId: string;
  jobTitle?: string;
  companyId?: string;
  companyName?: string;
  stage?: string;
};

interface LinkJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  currentLinkedJobs?: LinkedJobSummary[];
  /** Called with the updated linked jobs list after save */
  onLinked?: (linkedJobs: LinkedJobSummary[]) => void;
}

export function LinkJobModal({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  currentLinkedJobs = [],
  onLinked,
}: LinkJobModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: jobsData = [], isLoading } = useJobs();
  const allJobs: any[] = Array.isArray(jobsData)
    ? jobsData
    : Array.isArray((jobsData as any)?.jobs)
      ? (jobsData as any).jobs
      : [];

  const currentIds = currentLinkedJobs
    .map((j) => j.jobId)
    .filter(Boolean);

  useEffect(() => {
    if (open) {
      setSelectedJobIds(currentIds);
      setSearchQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidateId]);

  const filteredJobs = allJobs.filter((job: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.title?.toLowerCase().includes(query) ||
      job.companyName?.toLowerCase().includes(query) ||
      job.company_name?.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query)
    );
  });

  const toggleJob = (jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  const selectedJobs = allJobs.filter((job: any) =>
    selectedJobIds.includes(job.id)
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const toAdd = selectedJobIds.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !selectedJobIds.includes(id));

      for (const jobId of toAdd) {
        const job = allJobs.find((j: any) => j.id === jobId);
        if (!job) continue;
        const res = await fetch(`/api/data/leads/${candidateId}/job/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jobId: job.id,
            jobTitle: job.title || "Job",
            companyId: job.companyId || job.company_id,
            companyName: job.companyName || job.company_name,
            initialStage: "sourced",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Failed to link ${job.title}`);
        }
      }

      for (const jobId of toRemove) {
        const res = await fetch(
          `/api/data/leads/${candidateId}/job/${jobId}/unlink`,
          {
            method: "POST",
            credentials: "include",
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to unlink job");
        }
      }

      // Build updated list for UI
      const kept = currentLinkedJobs.filter((j) =>
        selectedJobIds.includes(j.jobId)
      );
      const added: LinkedJobSummary[] = toAdd.map((jobId) => {
        const job = allJobs.find((j: any) => j.id === jobId);
        return {
          jobId,
          jobTitle: job?.title || "Job",
          companyId: job?.companyId || job?.company_id,
          companyName: job?.companyName || job?.company_name,
          stage: "sourced",
        };
      });
      const next = [...kept, ...added];

      onLinked?.(next);
      toast.success(
        selectedJobIds.length > 0
          ? `Linked ${selectedJobIds.length} job(s)`
          : "Jobs unlinked"
      );
      onOpenChange(false);
    } catch (err: any) {
      console.error("Save linked jobs error:", err);
      toast.error(err.message || "Failed to save linked jobs");
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Always light surface — dark hover:bg-muted was charcoal on dark ink */}
      <div
        role="dialog"
        aria-modal="true"
        data-ink-on-light
        className="relative z-10 w-full max-w-lg mx-4 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden text-slate-900"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Link to job</h2>
            <p className="text-sm text-slate-600">{candidateName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search jobs by title, company, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
              autoFocus
            />
          </div>
        </div>

        {selectedJobIds.length > 0 && (
          <div className="px-6 py-3 border-b border-gray-200 bg-blue-50/60">
            <p className="text-xs font-medium text-slate-600 mb-2">
              SELECTED ({selectedJobIds.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedJobs.map((job: any) => (
                <Badge
                  key={job.id}
                  data-ink-keep
                  className="flex items-center gap-1 pr-1 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <span className="max-w-[180px] truncate">{job.title}</span>
                  <button
                    type="button"
                    onClick={() => toggleJob(job.id)}
                    className="ml-1 text-white/90 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-[300px] overflow-y-auto p-2 bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              <span className="ml-2 text-sm text-slate-600">Loading jobs...</span>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">
              {searchQuery ? (
                <p>No jobs match your search</p>
              ) : (
                <p>No jobs available — create a job first</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredJobs.map((job: any) => {
                const isSelected = selectedJobIds.includes(job.id);
                const isAlreadyLinked = currentIds.includes(job.id);

                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => toggleJob(job.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between border ${
                      isSelected
                        ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200"
                        : "border-transparent bg-white hover:bg-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 flex-shrink-0 text-slate-500" />
                        <span className="font-medium truncate text-slate-900">
                          {job.title}
                        </span>
                        {isAlreadyLinked && (
                          <Badge
                            variant="outline"
                            className="text-xs border-slate-300 text-slate-700 bg-white"
                          >
                            Linked
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600 ml-6">
                        <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {job.companyName ||
                            job.company_name ||
                            "No company"}
                        </span>
                        {job.location && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="truncate">{job.location}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ml-2 ${
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-slate-50">
          <p className="text-sm text-slate-600">
            {selectedJobIds.length} job(s) selected
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              data-ink-keep
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save links"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
