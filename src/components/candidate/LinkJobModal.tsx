"use client";

import { useState, useEffect } from "react";
import { Loader2, X, Search, Briefcase, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useJobs } from "@/lib/hooks/query-job";
import { useQueryClient } from "@tanstack/react-query";
import { leadKeys } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

interface LinkJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  currentLinkedJobIds: string[];
}

export function LinkJobModal({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  currentLinkedJobIds = [],
}: LinkJobModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all jobs
  const { data: allJobs = [], isLoading } = useJobs();

  // Initialize selected job IDs when modal opens
  useEffect(() => {
    if (open) {
      setSelectedJobIds(currentLinkedJobIds || []);
      setSearchQuery("");
    }
  }, [open, currentLinkedJobIds]);

  // Filter jobs based on search query
  const filteredJobs = allJobs.filter((job: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.title?.toLowerCase().includes(query) ||
      job.companyName?.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query)
    );
  });

  // Toggle job selection
  const toggleJob = (jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  // Get selected job objects
  const selectedJobs = allJobs.filter((job: any) =>
    selectedJobIds.includes(job.id)
  );

// Handle save - use the modern linkedJobs model
  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/data/leads/${candidateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // NEW: Build proper linkedJobs entries
          linkedJobs: selectedJobs.map((job: any) => ({
            jobId: job.id,
            jobTitle: job.title,
            companyId: job.companyId,
            companyName: job.companyName,
            stage: "sourced",           // default starting stage
            stageUpdatedAt: new Date().toISOString(),
            stageUpdatedBy: "", 
            notes: [],
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to update linked jobs");
      }

      // Strong refresh
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.details() });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["linkedJobsForCandidate", candidateId] });

      toast.success(
        selectedJobIds.length > 0
          ? `Successfully linked ${selectedJobIds.length} job(s)`
          : "Jobs unlinked successfully"
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold">Link Jobs to Candidate</h2>
            <p className="text-sm text-muted-foreground">{candidateName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs by title, company, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Selected Jobs */}
        {selectedJobIds.length > 0 && (
          <div className="px-6 py-3 border-b bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              SELECTED ({selectedJobIds.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedJobs.map((job: any) => (
                <Badge
                  key={job.id}
                  variant="default"
                  className="flex items-center gap-1 pr-1"
                >
                  <span>{job.title}</span>
                  <button
                    onClick={() => toggleJob(job.id)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Jobs List */}
        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading jobs...
              </span>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? (
                <p>No jobs match your search</p>
              ) : (
                <p>No jobs available</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredJobs.map((job: any) => {
                const isSelected = selectedJobIds.includes(job.id);
                const isAlreadyLinked = (currentLinkedJobIds || []).includes(job.id);

                return (
                  <button
                    key={job.id}
                    onClick={() => toggleJob(job.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      isSelected
                        ? "bg-primary/10 border border-primary"
                        : "hover:bg-muted border border-transparent"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">
                          {job.title}
                        </span>
                        {isAlreadyLinked && (
                          <Badge variant="outline" className="text-xs">
                            Linked
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground ml-6">
                        <Building2 className="h-3 w-3" />
                        <span className="truncate">
                          {job.companyName || "No company"}
                        </span>
                        {job.location && (
                          <>
                            <span>•</span>
                            <span className="truncate">{job.location}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Checkbox indicator */}
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ml-2 ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground"
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
          <p className="text-sm text-muted-foreground">
            {selectedJobIds.length} job(s) selected
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
