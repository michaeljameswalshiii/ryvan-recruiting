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
import { useJobsForCandidate, useUpdateCandidateStageInJob } from "@/lib/hooks/query-job";

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

type Tab = "overview" | "timeline" | "resume" | "notes" | "emails" | "details";

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
        const response = await fetch(`/api/candidate/${candidate.id}/events?limit=50`);
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
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add note');
      }
      
      const data = await response.json();
      if (data.success) {
        setNewNote("");
        toast.success('Note added successfully');
        // Refresh notes
        const eventsResponse = await fetch(`/api/candidate/${candidate.id}/events?limit=50`);
        const eventsData = await eventsResponse.json();
        const noteEvents = (eventsData.events || [])
          .filter((e: any) => e.eventType === 'NOTE')
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotes(noteEvents);
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
    { id: "notes", label: "Notes" },
    { id: "emails", label: "Emails" },
    { id: "details", label: "Details" },
  ];

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
              <a href="/candidates">
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
                  <span className="text-gray-400">•</span>
                  <span>{candidate.company}</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* Contact Information - Editable */}
              <div className="bg-white p-6 rounded-xl border">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" /> Contact Information
                </h2>
                
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    </div>
                    
                    {/* Notes - Rich Section */}
                    <div>
                      <label className="text-sm font-medium text-gray-600">Important Notes</label>
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        placeholder="Add notes about this candidate..."
                        rows={4}
                      />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
                  </div>
                )}
              </div>

{/* Notes Section - Multiple Notes Support */}
              <div className="bg-white p-6 rounded-xl border">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <StickyNote className="h-5 w-5" /> Notes
                </h2>
                
                {/* Add Note Form */}
                <div className="mb-4">
                  <Textarea
                    placeholder="Add a note about this candidate..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    className="w-full p-2 border border-input rounded-md resize-y min-h-[80px]"
                  />
                  <div className="flex justify-end mt-2">
                    <Button 
                      onClick={handleAddNote} 
                      disabled={addingNote || !newNote.trim()}
                      size="sm"
                    >
                      {addingNote ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Add Note
                        </>
                      )}
                    </Button>
                  </div>
                  {notesError && (
                    <p className="text-sm text-red-600 mt-2">{notesError}</p>
                  )}
                </div>
                
                {/* Notes List */}
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading notes...
                  </div>
                ) : notes.length > 0 ? (
                  <div className="space-y-3">
                    {notes.map((note, index) => (
                      <div 
                        key={note.id || index} 
                        className="p-3 bg-muted rounded-lg border"
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {note.metadata?.noteText || note.description || note.title}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{note.createdBy || 'Unknown'}</span>
                          <span>•</span>
                          <span>
                            {new Date(note.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No notes yet. Add your first note above.
                  </p>
                )}
              </div>

              {/* Linked Jobs Section */}
              <LinkedJobsSection candidateId={candidate.id} />

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
            </div>

            <div>
              <div className="bg-white p-6 rounded-xl border">
                <Badge variant="secondary" className="mb-4 capitalize">
                  {candidate.status}
                </Badge>
                <div className="text-sm space-y-2">
                  <div>
                    <strong>Source:</strong> {candidate.source || "—"}
                  </div>
                  <div>
                    <strong>Added:</strong>{" "}
                    {new Date(candidate.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Company Dropdown */}
              <div className="bg-white p-6 rounded-xl border mt-4">
                <h3 className="font-semibold mb-3">Company</h3>
                <select className="w-full p-2 border rounded-md text-sm bg-gray-50">
                  <option value="">{candidate.company || "Select company"}</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Multiple contacts available for this company
                </p>
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

        {/* Notes Tab */}
        {activeTab === "notes" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Notes</h2>
            {candidate.notes ? (
              <div className="prose prose-sm max-w-none">
                {candidate.notes}
              </div>
            ) : (
              <p className="text-gray-500">
                No notes yet. Click Edit to add notes.
              </p>
            )}
          </div>
        )}

        {/* Emails Tab */}
        {activeTab === "emails" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Email History</h2>
            <p className="text-gray-500">
              No emails sent yet. Use the Send Email button to compose an email.
            </p>
          </div>
        )}

        {/* Details Tab */}
        {activeTab === "details" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Full Details</h2>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(candidate, null, 2)}
            </pre>
          </div>
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

function LinkedJobsSection({ candidateId }: { candidateId: string }) {
  const { data: jobs, isLoading, isError } = useJobsForCandidate(candidateId);
  const updateStage = useUpdateCandidateStageInJob();

  const getCurrentStage = (job: any) => {
    const linked = (job.linkedCandidates || []).find((lc: any) => lc.candidateId === candidateId);
    return linked?.stage || "SOURCED";
  };

  const stageOptions = ["SOURCED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

  return (
    <div className="bg-white p-6 rounded-xl border">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <Briefcase className="h-5 w-5" /> Linked Jobs
      </h2>

      {isLoading && <p className="text-sm text-gray-500">Loading linked jobs...</p>}
      {isError && <p className="text-sm text-red-600">Failed to load linked jobs.</p>}

      {!isLoading && !isError && (!jobs || jobs.length === 0) && (
        <p className="text-sm text-gray-500">
          No jobs linked yet. Link jobs from the Jobs pipeline.
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
    </div>
  );
}
