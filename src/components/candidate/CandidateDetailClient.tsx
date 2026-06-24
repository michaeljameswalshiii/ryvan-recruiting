'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { ResumeUpload } from "@/components/candidate/ResumeUpload";
import EventTimeline from "@/components/EventTimeline";
import { toast } from "sonner";

interface CandidateDetailClientProps {
  candidate: any;
}

export default function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("Conversation");

  // Fetch activity/notes
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const res = await fetch(`/api/candidate/${candidate.id}/events?t=${Date.now()}`);
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
  }, [candidate.id]);

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
                {candidate.name?.split(" ").map((n: string) => n[0]).join("")}
              </div>
              <div>
                <h1 className="text-4xl font-semibold">{candidate.name}</h1>
                <p className="text-2xl text-gray-600">{candidate.title}</p>
                <p className="text-gray-500">{candidate.email} • {candidate.phone}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline">Edit</Button>
          <Button>Send Email</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-7 space-y-8">
          {/* Contact Info */}
          <Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
              <div><strong>Phone</strong><p>{candidate.phone}</p></div>
              <div><strong>Email</strong><p>{candidate.email}</p></div>
              <div><strong>Location</strong><p>{candidate.location || "Orlando, FL"}</p></div>
              <div><strong>Title</strong><p>{candidate.title}</p></div>
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
              ) : (
                <EventTimeline events={notes} />
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
              <ResumeViewer url={candidate.resumeUrl} candidateId={candidate.id} fileName={candidate.resumeFileName} />
              <ResumeUpload candidateId={candidate.id} />
            </CardContent>
          </Card>

          {/* Summary, Experience, Skills can be added here later */}
        </div>
      </div>
    </div>
  );
}
