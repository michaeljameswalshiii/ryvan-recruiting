'use client';

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Mail, Phone, MapPin, Calendar } from "lucide-react";
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

  // Fetch notes
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const res = await fetch(`/api/candidate/${candidate.id}/events?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setNotes(Array.isArray(data) ? data : data.events || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setNotesLoading(false);
      }
    };
    fetchNotes();
  }, [candidate.id]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    // Add your existing note API call here
    toast.success("Note added");
    setNewNote("");
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5 mr-2" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-semibold">
                {candidate.name?.split(" ").map(n => n[0]).join("")}
              </div>
              <div>
                <h1 className="text-4xl font-semibold">{candidate.name}</h1>
                <p className="text-xl text-gray-600">{candidate.title}</p>
                <p className="text-sm text-gray-500">{candidate.email} • {candidate.phone}</p>
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
        {/* LEFT COLUMN */}
        <div className="lg:col-span-7 space-y-8">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 text-sm">
              <div><strong>Phone:</strong> {candidate.phone}</div>
              <div><strong>Email:</strong> {candidate.email}</div>
              <div><strong>Location:</strong> {candidate.location || "Orlando, FL"}</div>
              <div><strong>Title:</strong> {candidate.title}</div>
            </CardContent>
          </Card>

          {/* Pipeline Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-6">
                {["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"].map((stage) => (
                  <Badge key={stage} variant={stage === "Interviewing" ? "default" : "secondary"} className="px-4 py-2">
                    {stage}
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

          {/* Notes & Activity Log */}
          <Card>
            <CardHeader>
              <CardTitle>Notes & Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-6">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-48">
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
                  <Plus className="h-4 w-4 mr-2" /> Log
                </Button>
              </div>

              {notesLoading ? (
                <Loader2 className="animate-spin mx-auto" />
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
              <CardTitle className="flex justify-between">
                Resume
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">View</Button>
                  <Button variant="outline" size="sm">Refresh</Button>
                </div>
              </CardTitle>
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
            <CardContent className="prose text-sm">
              {candidate.summary || "Results-driven professional with strong experience in the industry..."}
            </CardContent>
          </Card>

          {/* Experience, Education, Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              {/* Add experience items here from candidate.experience */}
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {candidate.skills?.map((skill: string) => (
                  <Badge key={skill} variant="secondary">{skill}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
