'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** Matches server candidateNoteTypes in candidate-events.ts */
const NOTE_TYPES = [
  { value: "general", label: "General Note" },
  { value: "phone_call", label: "Phone call" },
  { value: "email_sent", label: "Email sent" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow-up" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "contract_signed", label: "Contract signed" },
  { value: "placement_made", label: "Placement made" },
  { value: "check_in", label: "Check-in" },
  { value: "other", label: "Other" },
  // Legacy labels used in older UI (still accepted / displayed)
  { value: "Conversation", label: "Conversation" },
  { value: "Interview Scheduled", label: "Interview Scheduled" },
  { value: "Submitted", label: "Submitted" },
  { value: "Email Sent", label: "Email Sent" },
] as const;

interface CandidateDetailClientProps {
  candidate: any;
}

export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  return <CandidateDetailClientInner candidate={candidate} />;
}

function CandidateDetailClientInner({ candidate }: CandidateDetailClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [addingNote, setAddingNote] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Contact info
  const [contactInfo, setContactInfo] = useState({
    email: candidate?.email || '',
    phone: candidate?.phone || '',
    location: candidate?.location || '',
    title: candidate?.title || '',
  });

  // Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    email: '',
    phone: '',
    location: '',
    title: '',
  });
  const [isSavingContact, setIsSavingContact] = useState(false);

  const safeCandidate = candidate || {};
  const candidateId = safeCandidate.id || '';
  const candidateName = safeCandidate.name || '';
  const candidateResumeUrl = safeCandidate.resumeUrl || '';
  const candidateResumeFileName = safeCandidate.resumeFileName || '';
  const candidateSummary = safeCandidate.summary || '';
  const candidateStage = safeCandidate.stage || 'Identified';

  const fetchNotes = async () => {
    if (!candidateId) {
      setNotesLoading(false);
      return;
    }
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}/events?t=${Date.now()}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        const events = Array.isArray(data) ? data : data.events || [];
        setNotes(events);
      }
    } catch (err) {
      console.error("Failed to fetch notes", err);
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const handleAddNote = async () => {
    if (!newNote.trim() || !candidateId) return;

    setAddingNote(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteText: newNote.trim(),
          noteType,
          stage: candidateStage || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add note");
      }

      toast.success("Note logged successfully");
      setNewNote("");
      setNoteType("general");
      await fetchNotes();
    } catch (err: any) {
      console.error("Failed to log note", err);
      toast.error(err?.message || "Failed to log note");
    } finally {
      setAddingNote(false);
    }
  };

  const getNoteTypeLabel = (note: any): string => {
    const meta = note?.metadata || {};
    if (meta.noteTypeLabel) return meta.noteTypeLabel;
    if (meta.noteType) {
      const match = NOTE_TYPES.find((t) => t.value === meta.noteType);
      if (match) return match.label;
      return String(meta.noteType);
    }
    if (note?.eventType && note.eventType !== "NOTE") {
      return String(note.eventType).replace(/_/g, " ");
    }
    return "Note";
  };

  const getNoteBody = (note: any): string => {
    return (
      note?.metadata?.noteText ||
      note?.description ||
      note?.title ||
      note?.noteText ||
      "Note"
    );
  };

  const handleDeleteCandidate = async () => {
    if (!candidateId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Candidate deleted successfully');
        router.push('/dashboard/candidates');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete candidate');
      }
    } catch (err) {
      console.error('Error deleting candidate:', err);
      toast.error('Failed to delete candidate');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateId) return;

    setIsSavingContact(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          location: editForm.location.trim(),
          title: editForm.title.trim(),
        }),
      });

      if (res.ok) {
        const updated = {
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          location: editForm.location.trim(),
          title: editForm.title.trim(),
        };
        setContactInfo(updated);
        setShowEditModal(false);
        toast.success("Contact information updated successfully");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update contact information");
    } finally {
      setIsSavingContact(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const pipelineStages = ["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-6 border-b pb-6">
        <div className="flex items-start gap-6">
          <Avatar className="w-24 h-24 text-4xl bg-blue-600 text-white">
            {getInitials(candidateName)}
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{candidateName || "Unknown"}</h1>
            <p className="text-xl text-muted-foreground">{contactInfo.title || "No Title"}</p>
            <div className="flex gap-4 text-sm mt-2">
              {contactInfo.email && <a href={`mailto:${contactInfo.email}`} className="text-blue-600 hover:underline">{contactInfo.email}</a>}
              {contactInfo.phone && <span>{contactInfo.phone}</span>}
              {contactInfo.location && <span>{contactInfo.location}</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push(`/dashboard/candidates/${candidateId}/edit`)}>Full Edit</Button>
          <Button>Send Email</Button>
          {showDeleteConfirm ? (
            <>
              <Button variant="destructive" onClick={handleDeleteCandidate} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="jobs">Linked Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
          <div className="lg:col-span-7 space-y-8">
            {/* Contact Info Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Contact Information</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setEditForm({ ...contactInfo });
                    setShowEditModal(true);
                  }}
                >
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><strong className="block text-muted-foreground">Email</strong><p>{contactInfo.email || "No Email"}</p></div>
                <div><strong className="block text-muted-foreground">Phone</strong><p>{contactInfo.phone || "No Phone"}</p></div>
                <div><strong className="block text-muted-foreground">Location</strong><p>{contactInfo.location || "Not specified"}</p></div>
                <div><strong className="block text-muted-foreground">Title</strong><p>{contactInfo.title || "No Title"}</p></div>
              </CardContent>
            </Card>

            {/* Pipeline Stage */}
            <Card>
              <CardTitle className="px-6 pt-6">Pipeline Stage</CardTitle>
              <CardContent>
                <div className="flex gap-2 flex-wrap mb-6">
                  {pipelineStages.map((stage) => (
                    <Badge key={stage} variant={stage === candidateStage ? "default" : "secondary"} className="px-4 py-1.5">
                      {stage}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline">Move Back</Button>
                  <Button>Advance</Button>
                  <Button variant="destructive">Reject</Button>
                </div>
              </CardContent>
            </Card>

            {/* Notes & Activity Log — original UI with note types + API persistence */}
            <Card>
              <CardHeader>
                <CardTitle>Notes & Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue placeholder="Note type" />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add note detail here..."
                    className="flex-1 min-h-[80px]"
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                    className="sm:self-start"
                  >
                    {addingNote ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Log
                  </Button>
                </div>

                {notesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-4">
                    {notes.map((note: any, index: number) => (
                      <div
                        key={note.id || note.SK || index}
                        className="border-l-4 border-blue-200 pl-4 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {getNoteTypeLabel(note)}
                          </Badge>
                          <span>
                            {note.createdAt || note.timestamp
                              ? new Date(note.createdAt || note.timestamp).toLocaleString()
                              : "Recent"}
                          </span>
                          {note.createdBy && note.createdBy !== "system" && (
                            <span>· {note.createdBy}</span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{getNoteBody(note)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No activity yet. Log the first note above.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Professional Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                {candidateSummary || "No summary on file."}
              </CardContent>
            </Card>
            {candidateResumeUrl && (
              <Card>
                <CardHeader>
                  <CardTitle>Resume</CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={candidateResumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    {candidateResumeFileName || "View resume"}
                  </a>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Full Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {notesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-4">
                  {notes.map((note: any, index: number) => (
                    <div
                      key={note.id || note.SK || `tl-${index}`}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Badge variant="outline">{getNoteTypeLabel(note)}</Badge>
                        <span>
                          {note.createdAt || note.timestamp
                            ? new Date(note.createdAt || note.timestamp).toLocaleString()
                            : "Recent"}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-1">{note.title || getNoteTypeLabel(note)}</p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {getNoteBody(note)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No timeline events yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simple Modal (Tailwind only - no shadcn Dialog needed) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">Edit Contact Information</h2>
              <p className="text-sm text-muted-foreground mb-4">Update the candidate&apos;s details.</p>

              <form onSubmit={handleSaveContactInfo} className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Email</label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Phone</label>
                  <Input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Location</label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="City, State"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Title</label>
                  <Input
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    placeholder="Job Title"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSavingContact} className="flex-1">
                    {isSavingContact ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
