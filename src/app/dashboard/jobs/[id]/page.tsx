"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, MapPin, DollarSign, Calendar, Loader2, UserPlus, Trash2, Pencil } from "lucide-react";
import { useJob, useLinkCandidateToJob, useUnlinkCandidateFromJob, useUpdateCandidateStageInJob, useUpdateJob } from "@/lib/hooks/query-job";
import EventTimeline from "@/components/EventTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APPLICATION_STAGES } from "@/lib/schemas/lead";

const JOB_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;

const STAGES = APPLICATION_STAGES.map(s => s.value);

type JobStatus = (typeof JOB_STATUSES)[number];

function getStageLabel(stageValue: string) {
  const stage = APPLICATION_STAGES.find(s => s.value === stageValue);
  return stage?.label || stageValue;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id || "";

  const { data: job, isLoading, isError, error } = useJob(jobId);
  const updateJob = useUpdateJob();
  const linkCandidate = useLinkCandidateToJob();
  const unlinkCandidate = useUnlinkCandidateFromJob();
  const updateStage = useUpdateCandidateStageInJob();

  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [newCandidateStage, setNewCandidateStage] = useState("sourced");
  const [candidateNotes, setCandidateNotes] = useState("");

  const linkedCandidates = useMemo(() => {
    if (!job?.linkedCandidates || !Array.isArray(job.linkedCandidates)) return [];
    return job.linkedCandidates;
  }, [job]);

  const onChangeJobStatus = async (status: JobStatus) => {
    if (!jobId) return;
    await updateJob.mutateAsync({
      jobId,
      jobData: { status },
    });
  };

  const onLinkCandidate = async () => {
    if (!jobId || !candidateId || !candidateName) return;
    await linkCandidate.mutateAsync({
      jobId,
      candidateData: {
        candidateId,
        candidateName,
        candidateEmail: candidateEmail || undefined,
        stage: newCandidateStage,
        notes: candidateNotes || undefined,
      }
    });

    setCandidateId("");
    setCandidateName("");
    setCandidateEmail("");
    setCandidateNotes("");
    setNewCandidateStage("sourced");
  };

  const isMutating =
    updateJob.isPending || linkCandidate.isPending || unlinkCandidate.isPending || updateStage.isPending;

  if (!jobId) {
    return (
      <div className="p-6">
        <p className="text-red-600">Missing job ID.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-700">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading job details...
        </div>
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Link href="/dashboard/jobs" className="inline-flex items-center text-sm text-blue-600 hover:underline mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Jobs
        </Link>
        <div className="bg-white border rounded-xl p-6">
          <p className="text-red-600 font-medium">Failed to load job details.</p>
          {error instanceof Error && <p className="text-sm text-gray-600 mt-1">{error.message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/dashboard/jobs" className="inline-flex items-center text-sm text-blue-600 hover:underline mb-1">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Jobs
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <p className="text-sm text-gray-600">{job.companyName || "Unknown Company"}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary">{job.status || "OPEN"}</Badge>
            <select
              value={job.status || "OPEN"}
              onChange={(e) => onChangeJobStatus(e.target.value as JobStatus)}
              disabled={updateJob.isPending}
              className="border rounded-md px-3 py-2 text-sm bg-white"
            >
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/jobs/${job.id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <JobDeleteButton jobId={job.id} jobTitle={job.title} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border rounded-xl p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Briefcase className="h-5 w-5" /> Job Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <Building2 className="h-4 w-4 text-gray-500" /> {job.companyName || "—"}
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-500" /> {job.location || "—"}
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <DollarSign className="h-4 w-4 text-gray-500" /> {job.salaryRange || "—"}
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="h-4 w-4 text-gray-500" />{" "}
                  {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "—"}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description || "No description provided."}</p>
              </div>
            </div>

            <div className="bg-white border rounded-xl p-6">
              <h2 className="font-semibold mb-4">Linked Candidates ({linkedCandidates.length})</h2>

              {linkedCandidates.length === 0 ? (
                <p className="text-sm text-gray-500">No candidates linked yet.</p>
              ) : (
                <div className="space-y-3">
                  {linkedCandidates.map((lc: any) => (
                    <div key={lc.candidateId} className="border rounded-lg p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{lc.candidateName || "Unknown Candidate"}</p>
                          <p className="text-xs text-gray-600">{lc.candidateEmail || "No email"}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            className="border rounded-md px-2 py-1 text-sm"
                            value={lc.stage || "sourced"}
                            onChange={(e) =>
                              updateStage.mutate({
                                jobId,
                                candidateId: lc.candidateId,
                                stage: e.target.value,
                              })
                            }
                            disabled={updateStage.isPending}
                          >
                            {STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {getStageLabel(stage)}
                              </option>
                            ))}
                          </select>

                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <Link href={`/candidates/${lc.candidateId}`}>View Candidate</Link>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => unlinkCandidate.mutate({ jobId, candidateId: lc.candidateId })}
                            disabled={unlinkCandidate.isPending}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Unlink
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 border-t pt-6">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Link Candidate
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input value={candidateId} onChange={(e) => setCandidateId(e.target.value)} placeholder="Candidate ID" />
                  <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Candidate Name" />
                  <Input value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} placeholder="Candidate Email (optional)" />
                  <select
                    className="border rounded-md px-3 py-2 text-sm bg-white"
                    value={newCandidateStage}
                    onChange={(e) => setNewCandidateStage(e.target.value)}
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {getStageLabel(stage)}
                      </option>
                    ))}
                  </select>
                  <div className="md:col-span-2">
                    <Textarea
                      value={candidateNotes}
                      onChange={(e) => setCandidateNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={onLinkCandidate} disabled={isMutating || !candidateId || !candidateName}>
                    {linkCandidate.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Linking...
                      </>
                    ) : (
                      "Link Candidate"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white border rounded-xl p-6">
              <h2 className="font-semibold mb-4">Job Activity</h2>
              {/* Minimal fix here */}
              <EventTimeline 
                entityType="job" 
                entityId={job.id || jobId} 
                tenantId={(job.tenantId as string) || "default"} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Job Delete Button (unchanged)
function JobDeleteButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/dashboard/jobs');
      } else {
        alert('Failed to delete job');
      }
    } catch (err) {
      console.error('Error deleting job:', err);
      alert('Failed to delete job');
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Confirm'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => setShowConfirm(true)} className="text-red-600 hover:text-red-700">
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </Button>
  );
}
