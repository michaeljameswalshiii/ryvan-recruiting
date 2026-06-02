"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import EventTimeline from "@/components/EventTimeline";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { ArrowLeft, Mail, Edit, User, FileText, Save, X, Briefcase, Loader2, StickyNote, Send } from "lucide-react";
import { toast } from "sonner";
import { useJobsForCandidate, useUpdateCandidateStageInJob, useLinkCandidateToJob, useJobs } from "@/lib/hooks/query-job";

interface Note {
  id: string;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
}

interface Candidate {
  id: string;
  tenantId?: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  linkedin?: string;
  resumeUrl?: string;
  status: string;
  source?: string;
  location?: string;
  salaryRequirements?: string;
  notes?: string;
  createdAt: string;
  avatarInitials?: string;
}

interface CandidateDetailClientProps {
  candidate: Candidate;
}

type Tab = "overview" | "timeline" | "resume" | "linked-jobs";

export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: candidate.phone || "",
    email: candidate.email || "",
    location: candidate.location || "",
    salaryRequirements: candidate.salaryRequirements || "",
    notes: candidate.notes || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

// Fetch notes on mount
  useEffect(() => {
    async function fetchNotes() {
      try {
        setNotesLoading(true);
        // Use timestamp cache-busting to prevent stale data
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/candidate/${candidate.id}/events?limit=50&_t=${timestamp}`);
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }
        const data = await response.json();
        // Filter only NOTE events and sort newest first
        const noteEvents = (data.events || [])
          .filter((e: any) => e.eventType === 'NOTE')
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotes(noteEvents);
      } catch (err) {
        console.error('Failed to fetch notes:', err);
        setNotesError('Failed to load notes');
      } finally {
        setNotesLoading(false);
      }
    }
    fetchNotes();
  }, [candidate.id]);

  // Manual refresh notes
  const refreshNotes = async () => {
    try {
      setNotesLoading(true);
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/candidate/${candidate.id}/events?limit=50&_t=${timestamp}`);
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      const noteEvents = (data.events || [])
        .filter((e: any) => e.eventType === 'NOTE')
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotes(noteEvents);
    } catch (err) {
      console.error('Failed to refresh notes:', err);
      setNotesError('Failed to refresh notes');
    } finally {
      setNotesLoading(false);
    }
  };

  // Add note handler
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    try {
      setAddingNote(true);
      setNotesError(null);
      
const response = await fetch(`/api/candidate/${candidate.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote,
          // Include current pipeline stage for context
          stage: candidate.status,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add note');
      }
      
const data = await response.json();
      if (data.success) {
        setNewNote("");
        toast.success('Note added successfully');
        // Add a small delay to ensure the write completes before refetching
        await new Promise(resolve => setTimeout(resolve, 300));
        // Refresh notes with timestamp to prevent caching
        await refreshNotes();
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      setNotesError('Failed to add note');
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  // Generate avatar initials if not provided
  const avatarInitials =
    candidate.avatarInitials ||
    candidate.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    ...(candidate.resumeUrl ? [{ id: "resume" as Tab, label: "Resume" }] : []),
    { id: "linked-jobs", label: "Linked Jobs" },
  ];

  // Helper to display user name or email
  const displayUser = (userName?: string, userEmail?: string) => {
    return userName || userEmail || "Unknown";
  };

  // Handle email sending with event recording
  const handleSendEmail = async (subject: string, body: string) => {
    try {
      // Call API to record email event
      const response = await fetch(`/api/candidate/${candidate.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'EMAIL_SENT',
          title: 'Email Sent',
          description: `Subject: ${subject}`,
          metadata: { subject, body, sentTo: candidate.email }
        })
      });
      
      if (!response.ok) {
        console.error('Failed to record email event');
      }
      
      toast.success(`Email sent to ${candidate.email}`);
    } catch (err) {
      console.error('Error recording email event:', err);
      // Still show success since email was sent
      toast.success(`Email sent to ${candidate.email}`);
    }
  };

  // Save edited fields
  const handleSaveEdit = async () => {
    setIsSaving(true);
    
    try {
      const response = await fetch(`/api/data/leads/${candidate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: editForm.phone,
          email: editForm.email,
          location: editForm.location,
          notes: editForm.notes,
        }),
      });

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update');
      }

      toast.success('Candidate updated successfully');
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error updating candidate:', err);
      toast.error(err.message || 'Failed to update candidate');
    } finally {
      setIsSaving(false);
    }
  };

// Cancel editing
  const handleCancelEdit = () => {
    setEditForm({
      phone: candidate.phone || "",
      email: candidate.email || "",
      location: candidate.location || "",
      salaryRequirements: candidate.salaryRequirements || "",
      notes: candidate.notes || "",
    });
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
<Button variant="ghost" size="icon" asChild>
              <a href="/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white shadow">
                {avatarInitials}
              </div>
<div>
                <h1 className="text-3xl font-semibold tracking-tight">{candidate.name}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>{candidate.title}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              className="flex items-center gap-2" 
              onClick={() => setShowEmailModal(true)}
            >
              <Mail className="h-4 w-4" /> Send Email
            </Button>
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-8 border-b text-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6 space-y-8">
{/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2 space-y-6">
              {/* Contact Information - Editable */}
              <div className="bg-white p-6 rounded-xl border">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" /> Contact Information
                </h2>
                
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Email</label>
                        <Input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Phone</label>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Location</label>
                        <Input
                          value={editForm.location}
                          onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                          placeholder="Miami, FL"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">LinkedIn</label>
                        <Input
                          value={candidate.linkedin || ""}
                          placeholder="LinkedIn URL"
                          disabled
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Source</label>
                        <Input
                          value={candidate.source || ""}
                          placeholder="Source"
                          disabled
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Added</label>
                        <Input
                          value={new Date(candidate.createdAt).toLocaleDateString()}
                          disabled
                        />
                      </div>
</div>
                    
                    {/* Edit Actions */}
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={handleCancelEdit}>
                        <X className="h-4 w-4 mr-2" /> Cancel
                      </Button>
                      <Button onClick={handleSaveEdit} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" /> Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Email:</span>{" "}
                      <a
                        href={`mailto:${candidate.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {candidate.email || "—"}
                      </a>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span> {candidate.phone || "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Location:</span> {candidate.location || "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">LinkedIn:</span>{" "}
                      {candidate.linkedin ? (
                        <a
                          href={candidate.linkedin}
                          target="_blank"
                          className="text-blue-600 hover:underline"
                        >
                          View Profile
                        </a>
                      ) : "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Source:</span> {candidate.source || "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Added:</span>{" "}
                      {new Date(candidate.createdAt).toLocaleDateString()}
                    </div>
                  </div>
)}
              </div>

{/* Linked Jobs Section */}
              <LinkedJobsSection candidateId={candidate.id} candidateName={candidate.name} />

{/* Resume Section - Quick View */}
              {candidate.resumeUrl && (
                <div className="bg-white p-6 rounded-xl border">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5" /> Resume
                  </h2>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setActiveTab("resume")}
                    >
                      View Resume
                    </Button>
                    <a
                      href={candidate.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}

              {/* Notes Section - Quick View on Overview */}
              <div className="bg-white p-6 rounded-xl border">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <StickyNote className="h-5 w-5" /> Notes
                </h2>
                
                {/* Add Note Input */}
                <div className="flex gap-2 mb-4">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note about this candidate..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="flex justify-end mb-4">
                  <Button 
                    onClick={handleAddNote} 
                    disabled={addingNote || !newNote.trim()}
                    size="sm"
                  >
                    {addingNote ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...
                      </>
                    ) : (
                      <>
                        <StickyNote className="h-4 w-4 mr-2" /> Add Note
                      </>
                    )}
                  </Button>
                </div>

                {/* Notes List */}
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading notes...
                  </div>
                ) : notesError ? (
                  <p className="text-sm text-red-600">{notesError}</p>
                ) : notes.length === 0 ? (
                  <p className="text-sm text-gray-500">No notes yet. Add the first note above.</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note: any) => (
                      <div key={note.id} className="border rounded-lg p-3 bg-gray-50">
                        <p className="text-sm whitespace-pre-wrap">{note.description || note.title}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {note.createdBy ? `By ${note.createdBy} • ` : ''}
                          {new Date(note.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* View All Notes Link */}
                {notes.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setActiveTab("timeline")}
                      className="text-blue-600"
                    >
                      View all notes in Timeline →
                    </Button>
                  </div>
                )}
              </div>
            </div>

<div>
              <div className="bg-white p-6 rounded-xl border">
                <Badge variant="secondary" className="mb-4 capitalize">
                  {candidate.status}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === "timeline" && (
          <EventTimeline 
            entityType="candidate" 
            entityId={candidate.id} 
            tenantId={candidate.tenantId || "default"}
          />
        )}

        {/* Resume Tab */}
        {activeTab === "resume" && candidate.resumeUrl && (
          <div className="bg-white rounded-xl border overflow-hidden h-[720px] flex flex-col">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" /> Resume
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={candidate.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Full Screen
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={candidate.resumeUrl}
                    download={`${candidate.name.replace(/ /g, "-")}-resume.pdf`}
                    target="_blank"
                  >
                    Download
                  </a>
                </Button>
              </div>
            </div>
            <ResumeViewer
              url={candidate.resumeUrl}
              fileName={`${candidate.name.replace(/ /g, "-")}-resume.pdf`}
            />
          </div>
        )}

{/* Linked Jobs Tab - Full Page View */}
        {activeTab === "linked-jobs" && (
          <LinkedJobsTab candidateId={candidate.id} candidateName={candidate.name} />
        )}
      </div>

      {/* Send Email Modal */}
      <SendEmailModal
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        candidate={{
          email: candidate.email,
          name: candidate.name
        }}
        onSend={handleSendEmail}
      />
    </div>
  );
}

function LinkedJobsSection({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
  const { data: jobs, isLoading, isError, refetch } = useJobsForCandidate(candidateId);
  const updateStage = useUpdateCandidateStageInJob();
  const linkCandidate = useLinkCandidateToJob();
  const { data: allJobs } = useJobs();
  
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");

  const getCurrentStage = (job: any) => {
    const linked = (job.candidates || []).find((lc: any) => lc.candidateId === candidateId);
    return linked?.stage || "Applied";
  };

  const stageOptions = ["Applied", "Screening", "Interviewing", "Offered", "Placed", "Rejected", "Withdrawn"];

  // Get jobs that are not already linked
  const availableJobs = allJobs?.filter((job: any) => 
    !job.candidates?.some((lc: any) => lc.candidateId === candidateId)
  ) || [];

const handleLinkJob = async () => {
    if (!selectedJobId) return;
    
    try {
      await linkCandidate.mutateAsync({
        jobId: selectedJobId,
        candidateData: {
          candidateId,
candidateName: candidateName || "Unknown",
          stage: "Applied",
        }
      });
      toast.success('Job linked successfully');
      setShowLinkDialog(false);
      setSelectedJobId("");
      refetch();
    } catch (err: any) {
      console.error('Link job error:', err);
      toast.error(err.message || 'Failed to link job');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> Linked Jobs
        </h2>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowLinkDialog(true)}
        >
          + Link Job
        </Button>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading linked jobs...</p>}
      {isError && <p className="text-sm text-red-600">Failed to load linked jobs.</p>}

      {!isLoading && !isError && (!jobs || jobs.length === 0) && (
        <p className="text-sm text-gray-500">
          No jobs linked yet. Click "Link Job" to link this candidate to a job.
        </p>
      )}

      {!isLoading && !isError && jobs && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const currentStage = getCurrentStage(job);

            return (
              <div key={job.id} className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{job.title || "Untitled Job"}</p>
                  <p className="text-xs text-gray-600">{job.companyName || "Unknown Company"}</p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={currentStage}
                    onChange={(e) =>
                      updateStage.mutate({
                        jobId: job.id,
                        candidateId,
                        stage: e.target.value,
                      })
                    }
                    className="border rounded-md px-2 py-1 text-sm bg-white"
                    disabled={updateStage.isPending}
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>

                  <Button variant="outline" size="sm" asChild>
                    <a href={`/dashboard/jobs/${job.id}`}>View Job</a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link Job Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">Link Job to Candidate</h3>
            
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-600 mb-2 block">Select Job</label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Choose a job...</option>
                {availableJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>
                    {job.title} - {job.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowLinkDialog(false);
                  setSelectedJobId("");
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleLinkJob}
                disabled={!selectedJobId || linkCandidate.isPending}
              >
                {linkCandidate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Linking...
                  </>
                ) : (
                  'Link Job'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full Linked Jobs Tab with stage management
function LinkedJobsTab({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const { data: jobs, isLoading, isError, refetch } = useJobsForCandidate(candidateId);
  const updateStage = useUpdateCandidateStageInJob();

  // Group jobs by stage - matching schema stage names
  const jobsByStage: Record<string, any[]> = {
    Applied: [],
    Screening: [],
    Interviewing: [],
    Offered: [],
    Placed: [],
    Rejected: [],
    Withdrawn: [],
  };

  if (jobs) {
    jobs.forEach((job: any) => {
      const linked = (job.candidates || []).find((lc: any) => lc.candidateId === candidateId);
      const stage = linked?.stage || "Applied";
      if (jobsByStage[stage]) {
        jobsByStage[stage].push({ ...job, linkedStage: stage });
      }
    });
  }

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData("jobId", jobId);
    e.dataTransfer.effectAllowed = "move";
  };

  // Handle drop
  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("jobId");
    if (!jobId) return;

    try {
      await updateStage.mutateAsync({
        jobId,
        candidateId,
        stage: newStage,
      });
      toast.success(`Stage updated to ${newStage}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to update stage");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const stageLabels: Record<string, string> = {
    Applied: "Applied",
    Screening: "Screening",
    Interviewing: "Interview",
    Offered: "Offer",
    Placed: "Placed",
    Rejected: "Rejected",
    Withdrawn: "Withdrawn",
  };

  const stageColors: Record<string, string> = {
    Applied: "bg-gray-100 border-gray-300",
    Screening: "bg-blue-100 border-blue-300",
    Interviewing: "bg-purple-100 border-purple-300",
    Offered: "bg-yellow-100 border-yellow-300",
    Placed: "bg-green-100 border-green-300",
    Rejected: "bg-red-100 border-red-300",
    Withdrawn: "bg-gray-100 border-gray-200",
  };

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-xl border">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading linked jobs...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-xl border">
        <p className="text-red-600">Failed to load linked jobs.</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border text-center py-12">
        <Briefcase className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium">No Jobs Linked</p>
        <p className="text-sm text-gray-500 mt-1">
          {candidateName} is not linked to any jobs yet.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Link jobs from the Jobs Pipeline to track their progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border">
        <h2 className="font-semibold mb-2">Drag & Drop to Change Stage</h2>
        <p className="text-sm text-gray-500">
          Drag candidates between columns to update their stage in each job.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(jobsByStage).map(([stage, stageJobs]) => (
          <div
            key={stage}
            className={`border-2 rounded-lg p-3 min-h-[200px] ${stageColors[stage]} ${
              stage === "REJECTED" ? "opacity-60" : ""
            }`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <h3 className="font-semibold text-sm mb-3 flex items-center justify-between">
              {stageLabels[stage]}
              <span className="bg-white bg-opacity-50 px-2 py-0.5 rounded-full text-xs">
                {stageJobs.length}
              </span>
            </h3>
            <div className="space-y-2">
              {stageJobs.map((job: any) => (
                <div
                  key={job.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, job.id)}
                  className="bg-white p-3 rounded-lg border shadow-sm cursor-move hover:shadow-md transition-shadow"
                >
                  <p className="font-medium text-sm">{job.title}</p>
                  <p className="text-xs text-gray-500">{job.companyName}</p>
                  <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" asChild>
                    <a href={`/dashboard/jobs/${job.id}`}>View Job</a>
                  </Button>
                </div>
              ))}
              {stageJobs.length === 0 && (
                <p className="text-xs text-gray-400 italic">Drop here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
