'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Mail, FileText, ExternalLink, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CandidateDetailClientProps {
  candidate: any;
}

// Named export for compatibility with both import styles
export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
// Also keep default export for backward compatibility
  return <CandidateDetailClientInner candidate={candidate} />;
}

function CandidateDetailClientInner({ candidate }: CandidateDetailClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
const [noteType, setNoteType] = useState("Conversation");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Safely access candidate properties with fallbacks
  const safeCandidate = candidate || {};
  const candidateId = safeCandidate.id || '';
  const candidateName = safeCandidate.name || '';
  const candidateEmail = safeCandidate.email || '';
  const candidatePhone = safeCandidate.phone || '';
  const candidateTitle = safeCandidate.title || '';
  const candidateLocation = safeCandidate.location || '';
  const candidateResumeUrl = safeCandidate.resumeUrl || '';
  const candidateResumeFileName = safeCandidate.resumeFileName || '';

  // Fetch activity/notes - only if we have a valid ID
  useEffect(() => {
    if (!candidateId) {
      setNotesLoading(false);
      return;
    }
    const fetchNotes = async () => {
      try {
        const res = await fetch(`/api/candidate/${candidateId}/events?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setNotes(Array.isArray(data) ? data : (data.events || []));
        }
      } catch (err) {
        console.error("Failed to fetch notes", err);
      } finally {
        setNotesLoading(false);
      }
    };
    fetchNotes();
  }, [candidateId]);

const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      // TODO: Call your note API
      toast.success("Note logged successfully");
      setNewNote("");
    } catch (err) {
      toast.error("Failed to log note");
    }
  };

  // Handle candidate deletion
  const handleDeleteCandidate = async () => {
    if (!candidateId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'DELETE',
      });
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

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-5 w-5" /> Back to Candidates
          </Button>
          <div>
<div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-4xl font-bold">
                {candidateName ? candidateName.split(" ").map((n: string) => n[0]).join("") : "?"}
              </div>
              <div>
                <h1 className="text-4xl font-semibold">{candidateName || "Unknown"}</h1>
                <p className="text-2xl text-gray-600">{candidateTitle || "No Title"}</p>
                <p className="text-gray-500">{candidateEmail || "No Email"}{candidatePhone ? ` • ${candidatePhone}` : ''}</p>
              </div>
            </div>
          </div>
        </div>

<div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push(`/dashboard/candidates/${candidateId}/edit`)}>Edit</Button>
          <Button>Send Email</Button>
          {showDeleteConfirm ? (
            <>
              <Button variant="destructive" onClick={handleDeleteCandidate} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-7 space-y-8">
          {/* Contact Info */}
<Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
              <div><strong>Phone</strong><p>{candidatePhone || "No Phone"}</p></div>
              <div><strong>Email</strong><p>{candidateEmail || "No Email"}</p></div>
              <div><strong>Location</strong><p>{candidateLocation || "Orlando, FL"}</p></div>
              <div><strong>Title</strong><p>{candidateTitle || "No Title"}</p></div>
            </CardContent>
          </Card>

          {/* Pipeline Stage */}
          <Card>
            <CardHeader><CardTitle>Pipeline Stage</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-6">
                {["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"].map((s) => (
                  <Badge key={s} variant={s === "Interviewing" ? "default" : "secondary"} className="px-4 py-1.5">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline">Move Back</Button>
                <Button>Advance to Offer Out</Button>
                <Button variant="destructive">Reject</Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Activity */}
          <Card>
            <CardHeader><CardTitle>Notes & Activity Log</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-4">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Conversation">Conversation</SelectItem>
                    <SelectItem value="Interview Scheduled">Interview Scheduled</SelectItem>
                    <SelectItem value="Submitted">Submitted</SelectItem>
                    <SelectItem value="Email Sent">Email Sent</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add note detail here..."
                  className="flex-1 min-h-[80px]"
                />
                <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                  <Plus className="mr-2 h-4 w-4" /> Log
                </Button>
              </div>

              {notesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-4">
                  {notes.map((note: any, index: number) => (
                    <div key={note.id || index} className="border-l-4 border-blue-200 pl-4 py-2">
                      <div className="text-xs text-gray-500">
                        {note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Recent'}
                      </div>
                      <p className="text-sm">{note.description || note.title || note.noteText || 'Note'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No activity yet</p>
              )}
            </CardContent>
          </Card>
        </div>

{/* Right Sidebar */}
        <div className="lg:col-span-5 space-y-8">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
<CardContent>
              {candidateResumeUrl ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <FileText className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-sm text-gray-600 mb-4">Resume: {candidateResumeFileName || 'Uploaded'}</p>
                  <Button asChild>
                    <a href={candidateResumeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Resume
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-500">No resume uploaded</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary, Experience, Skills can be added here later */}
        </div>
      </div>
    </div>
  );
}
