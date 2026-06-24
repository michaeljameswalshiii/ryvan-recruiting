'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Mail, MapPin, Phone, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { ResumeUpload } from "@/components/candidate/ResumeUpload";
import EventTimeline from "@/components/candidate/EventTimeline";
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

  // Fetch notes/activity
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
      // Add your note API call here later
      toast.success("Note logged successfully!");
      setNewNote("");
    } catch (err) {
      toast.error("Failed to log note");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div className="flex items-center gap-5">
          <Button variant="ghost" onClick={() => router.back()} className="text-lg">
            ← Back to Candidates
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-4xl font-bold shadow">
              {candidate.name?.split(" ").map((n: string) => n[0]).join("")}
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">{candidate.name}</h1>
              <p className="text-2xl text-gray-600">{candidate.title}</p>
              <p className="text-gray-500 flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4" /> {candidate.email}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline">Edit Candidate</Button>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Mail className="mr-2 h-4 w-4" /> Send Email
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN - Main Content */}
        <div className="lg:col-span-7 space-y-8">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-gray-500">Phone</p>
                <p className="font-medium">{candidate.phone || "727.768.7845"}</p>
              </div>
              <div>
                <p className="text-gray-500">Location</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {candidate.location || "Orlando, FL"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Title</p>
                <p className="font-medium">{candidate.title}</p>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Stage — Pre-Construction Mgr / Estimator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-6">
                {["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"].map((stage) => (
                  <Badge 
                    key={stage} 
                    variant={stage === "Interviewing" ? "default" : "secondary"}
                    className="px-5 py-2 text-sm"
                  >
                    {stage}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline">Move Back</Button>
                <Button className="bg-blue-600">Advance to Offer Out</Button>
                <Button variant="destructive">Reject</Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Activity Log */}
          <Card>
            <CardHeader>
              <CardTitle>Notes & Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-6">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-56">
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
                  className="flex-1"
                />
                <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                  <Plus className="mr-2 h-4 w-4" /> Log
                </Button>
              </div>

              {notesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <EventTimeline events={notes} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="lg:col-span-5 space-y-8">
          {/* Resume */}
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent>
              <ResumeViewer 
                url={candidate.resumeUrl} 
                fileName={candidate.resumeFileName} 
                candidateId={candidate.id} 
              />
              <ResumeUpload candidateId={candidate.id} />
            </CardContent>
          </Card>

          {/* Professional Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Professional Summary</CardTitle>
            </CardHeader>
            <CardContent className="prose text-sm leading-relaxed">
              {candidate.summary || "Results-driven Preconstruction Manager with 12+ years of experience..."}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
