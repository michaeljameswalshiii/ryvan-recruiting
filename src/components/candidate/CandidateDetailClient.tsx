'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Mail, FileText, ExternalLink, Trash2, Briefcase, GraduationCap, Brain } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CandidateDetailClientProps {
  candidate: any;
}

// Named export for compatibility with both import styles
export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
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
  const candidateSummary = safeCandidate.summary || '';
  const candidateStage = safeCandidate.stage || 'Identified';

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

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Pipeline stages
  const pipelineStages = ["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"];
  const currentStageIndex = pipelineStages.indexOf(candidateStage);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header - Matches screenshot style */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-6 border-b pb-6">
        <div className="flex items-start gap-6">
          <Avatar className="w-24 h-24 text-4xl bg-blue-600 text-white">
            {getInitials(candidateName)}
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{candidateName || "Unknown"}</h1>
            <p className="text-xl text-muted-foreground">{candidateTitle || "No Title"}</p>
            <div className="flex gap-4 text-sm mt-2">
              {candidateEmail && (
                <a href={`mailto:${candidateEmail}`} className="text-blue-600 hover:underline">
                  {candidateEmail}
                </a>
              )}
              {candidatePhone && <span>{candidatePhone}</span>}
              {candidateLocation && <span>{candidateLocation}</span>}
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="jobs">Linked Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-8">
            {/* Contact Info Card */}
            <Card>
              <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Email</strong><p>{candidateEmail || "No Email"}</p></div>
                <div><strong>Phone</strong><p>{candidatePhone || "No Phone"}</p></div>
                <div><strong>Location</strong><p>{candidateLocation || "Not specified"}</p></div>
                <div><strong>Title</strong><p>{candidateTitle || "No Title"}</p></div>
              </CardContent>
            </Card>

            {/* Pipeline Stage */}
            <Card>
              <CardTitle className="px-6 pt-6">Pipeline Stage</CardTitle>
              <CardContent>
                <div className="flex gap-2 flex-wrap mb-6">
                  {pipelineStages.map((stage) => (
                    <Badge 
                      key={stage} 
                      variant={stage === candidateStage ? "default" : "secondary"}
                      className="px-4 py-1.5"
                    >
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

            {/* Notes & Activity Log */}
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
          <div className="lg:col-span-5 space-y-6">
            {/* Professional Summary */}
            <Card>
              <CardHeader><CardTitle>Professional Summary</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {candidateSummary || (
                  <p className="text-gray-500 italic">Add summary...</p>
                )}
              </CardContent>
            </Card>

            {/* Experience */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" /> Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-gray-500">Add experience...</p>
              </CardContent>
            </Card>

            {/* Education */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" /> Education
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-gray-500">Add education...</p>
              </CardContent>
            </Card>

            {/* Evaluation Tools */}
            <Card>
              <CardHeader><CardTitle>Evaluation Tools</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" variant="outline">
                  <Brain className="mr-2 h-4 w-4" />
                  Match Against Job Requirements
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  Generate Interview Questions
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  Summarize Resume for Client
                </Button>
              </CardContent>
            </Card>

            {/* Resume Card */}
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
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
            <CardContent>
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
        </TabsContent>

        {/* Resume Tab */}
        <TabsContent value="resume" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Resume</CardTitle></CardHeader>
            <CardContent>
              {candidateResumeUrl ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <FileText className="h-24 w-24 text-gray-400 mb-4" />
                  <p className="text-lg mb-4">Resume: {candidateResumeFileName || 'Uploaded'}</p>
                  <Button asChild size="lg">
                    <a href={candidateResumeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-5 w-5" />
                      View Resume
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-24 w-24 text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">No resume uploaded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linked Jobs Tab */}
        <TabsContent value="jobs" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Linked Jobs</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-24 w-24 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">No jobs linked yet</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
