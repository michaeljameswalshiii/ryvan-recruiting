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
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const [noteType, setNoteType] = useState("Conversation");
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

            {/* Notes section - keep your original code here */}
            <Card>
              <CardHeader><CardTitle>Notes & Activity Log</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {/* Your original notes code */}
              </CardContent>
            </Card>
          </div>
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
