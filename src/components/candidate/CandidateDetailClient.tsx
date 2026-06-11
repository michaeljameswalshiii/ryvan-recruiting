"use client";

import React, { useState, useEffect, useRef, ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import EventTimeline from "@/components/EventTimeline";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { ResumeUpload } from "@/components/candidate/ResumeUpload";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { ArrowLeft, Mail, Edit, User, FileText, Save, X, Briefcase, Loader2, StickyNote, Send, ExternalLink, Download, Plus, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useJobsForCandidate, useUpdateCandidateStageInJob, useLinkCandidateToJob, useUnlinkCandidateFromJob, useJobs, useUpdateCandidateStageInJobAppCentric, useAddJobSpecificNote, useLinkedJobsForCandidate, useLinkCandidateToJobAppCentric, useUnlinkCandidateFromJobAppCentric } from "@/lib/hooks/query-job";
import { APPLICATION_STAGES, getStageLabel, getStageColor } from "@/lib/schemas/lead";

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
  resumeFileName?: string;
  status: string;
  source?: string;
  location?: string;
  fullAddress?: string;
  salaryRequirements?: string;
  summary?: string;
  skills?: string[];
  experience?: any[];
  education?: any[];
  certifications?: string[];
  notes?: string;
  createdAt: string;
  avatarInitials?: string;
}

interface CandidateDetailClientProps {
  candidate: Candidate;
}

type Tab = "overview" | "timeline" | "resume" | "linked-jobs";

// Pipeline stages
const PIPELINE_STAGES = ["Identified", "Submitted", "Interviewing", "Offer Out", "Accepted"];
const STAGE_COLORS: Record<string, string> = {
  "Identified": "bg-gray-100 text-gray-600",
  "Submitted": "bg-blue-100 text-blue-600",
  "Interviewing": "bg-purple-100 text-purple-600",
  "Offer Out": "bg-yellow-100 text-yellow-600",
  "Accepted": "bg-green-100 text-green-600",
};

// Activity types with colors
const ACTIVITY_TYPES = [
  { value: "conversation", label: "Conversation", color: "bg-blue-100 text-blue-800" },
  { value: "interview_scheduled", label: "Interview Scheduled", color: "bg-purple-100 text-purple-800" },
  { value: "submitted", label: "Submitted", color: "bg-indigo-100 text-indigo-800" },
  { value: "left_message", label: "Left Message", color: "bg-orange-100 text-orange-800" },
  { value: "email_sent", label: "Email Sent", color: "bg-cyan-100 text-cyan-800" },
  { value: "offer_extended", label: "Offer Extended", color: "bg-yellow-100 text-yellow-800" },
  { value: "offer_accepted", label: "Offer Accepted", color: "bg-green-100 text-green-800" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-800" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-800" },
];

export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [currentResumeUrl, setCurrentResumeUrl] = useState(candidate.resumeUrl || "");
  const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState({
    name: candidate.name || "",
    phone: candidate.phone || "",
    email: candidate.email || "",
    salaryRequirements: candidate.salaryRequirements || "",
    linkedin: candidate.linkedin || "",
    resumeUrl: candidate.resumeUrl || "",
  });
const [editAddress, setEditAddress] = useState({
    fullAddress: (candidate as any).fullAddress || "",
  });
// Job titles state - support multiple titles
  const [jobTitles, setJobTitles] = useState<string[]>(
    candidate.title ? candidate.title.split(",").map(t => t.trim()).filter(Boolean) : []
  );
  const [newJobTitle, setNewJobTitle] = useState("");
  // Skills, Experience, Education, Certifications - editable fields
  const [editSkills, setEditSkills] = useState((candidate as any).skills?.join(", ") || "");
  const [editExperience, setEditExperience] = useState((candidate as any).experience?.map((exp: any) => 
    `${exp.title || ''} at ${exp.company || ''} ${exp.dates || ''}`
  ).join("\n") || "");
  const [editEducation, setEditEducation] = useState((candidate as any).education?.map((edu: any) => 
    `${edu.degree || ''} at ${edu.school || ''} ${edu.dates || ''}`
  ).join("\n") || "");
  const [editCertifications, setEditCertifications] = useState((candidate as any).certifications?.join(", ") || "");
  // LinkedIn state - added for editing
  const [linkedin, setLinkedin] = useState(candidate.linkedin || "");
  // Address state
  const [address, setAddress] = useState({
    street: candidate.location?.split(",")[0]?.trim() || "", // Use location field as street for now
    city: "",
    state: "",
    zip: "",
    country: "",
  });
  // Location preference state (multi-select)
  const [locationPreference, setLocationPreference] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Location preferences options
  const locationOptions = ["On-Site", "Hybrid", "Remote"];

// Pipeline stage state
  const [currentStage, setCurrentStage] = useState(candidate.status || "Identified");
  const [updatingStage, setUpdatingStage] = useState(false);

// Activity/Notes state for new design
  const [activityNote, setActivityNote] = useState("");
  const [activityType, setActivityType] = useState("conversation");
  const [loggingActivity, setLoggingActivity] = useState(false);

  // Notes/Activity legacy state (for backward compatibility)
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Note Types
  const noteTypes = [
    { value: 'general', label: 'General Note' },
    { value: 'phone_call', label: 'Phone call' },
    { value: 'email_sent', label: 'Email sent' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'follow_up', label: 'Follow-up' },
    { value: 'proposal_sent', label: 'Proposal sent' },
    { value: 'contract_signed', label: 'Contract signed' },
    { value: 'placement_made', label: 'Placement made' },
    { value: 'check_in', label: 'Check-in' },
    { value: 'other', label: 'Other' },
  ];

// Fetch all events on mount (not just notes)
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
        // Show ALL events (notes, resume uploads, emails, status changes, etc.) - sort newest first
        const allEvents = (data.events || [])
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotes(allEvents);
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
      // Show ALL events
      const allEvents = (data.events || [])
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotes(allEvents);
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
          noteType: noteType,
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
        setNoteType('general');
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
    { id: "resume", label: "Resume (Archive)" },
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

// Add job title handler
  const handleAddJobTitle = () => {
    if (!newJobTitle.trim()) return;
    if (!jobTitles.includes(newJobTitle.trim())) {
      setJobTitles([...jobTitles, newJobTitle.trim()]);
    }
    setNewJobTitle("");
  };

// Remove job title handler
  const handleRemoveJobTitle = (titleToRemove: string) => {
    setJobTitles(jobTitles.filter(t => t !== titleToRemove));
  };

  // Toggle location preference handler
  const handleToggleLocationPreference = (pref: string) => {
    if (locationPreference.includes(pref)) {
      setLocationPreference(locationPreference.filter(p => p !== pref));
    } else {
      setLocationPreference([...locationPreference, pref]);
    }
  };

// Save edited fields
  const handleSaveEdit = async () => {
    setIsSaving(true);
    
    try {
      // Map camelCase to snake_case for the API
      const response = await fetch(`/api/data/leads/${candidate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          email: editForm.email,
          title: jobTitles.join(","),
          location: editAddress.fullAddress,
          linkedin_url: editForm.linkedin,
          full_address: editAddress.fullAddress,
          salary_requirements: editForm.salaryRequirements,
          resume_url: editForm.resumeUrl,
        }),
      });

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update');
      }

toast.success('Candidate updated successfully');
      setIsEditing(false);
      // Refresh the page to show updated data
      window.location.reload();
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
      name: candidate.name || "",
      phone: candidate.phone || "",
      email: candidate.email || "",
      salaryRequirements: candidate.salaryRequirements || "",
      linkedin: candidate.linkedin || "",
      resumeUrl: candidate.resumeUrl || "",
    });
    setEditAddress({
      fullAddress: (candidate as any).fullAddress || "",
    });
    setJobTitles(candidate.title ? candidate.title.split(",").map(t => t.trim()).filter(Boolean) : []);
    setLocationPreference([]);
    setIsEditing(false);
  };

  // Handle resume replace - refresh the page to get new resume
  const handleResumeReplace = () => {
    window.location.reload();
  };

// Pipeline Stage handlers
  const getCurrentStageIndex = () => PIPELINE_STAGES.indexOf(currentStage);
  
  const handleAdvanceStage = async (newStage: string) => {
    if (!newStage || newStage === currentStage) return;
    try {
      setUpdatingStage(true);
      const response = await fetch(`/api/data/leads/${candidate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStage }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update stage');
      }
      setCurrentStage(newStage);
      toast.success(`Stage updated to ${newStage}`);
    } catch (err: any) {
      console.error('Error updating stage:', err);
      toast.error(err.message || 'Failed to update stage');
    } finally {
      setUpdatingStage(false);
    }
  };
  
  const handleMoveBack = () => {
    const currentIndex = getCurrentStageIndex();
    if (currentIndex > 0) {
      handleAdvanceStage(PIPELINE_STAGES[currentIndex - 1]);
    }
  };
  
  const handleAdvanceToOffer = () => {
    handleAdvanceStage("Offer Out");
  };
  
  const handleReject = () => {
    handleAdvanceStage("Rejected");
  };

  // Handle delete resume
  const handleDeleteResume = async () => {
    if (!confirm("Are you sure you want to delete this resume?")) return;
    
    try {
      const response = await fetch(`/api/data/leads/${candidate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_url: null,
        }),
      });

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete resume');
      }

      toast.success('Resume deleted successfully');
      // Clear the local state instead of reloading the page
      setCurrentResumeUrl("");
    } catch (err: any) {
      console.error('Error deleting resume:', err);
      toast.error(err.message || 'Failed to delete resume');
    }
  };

return (
    <div className="min-h-screen bg-background text-foreground">
{/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
<Button variant="ghost" size="icon" asChild>
              <a href="https://turnkey-optimization.vercel.app/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Button>

<div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white shadow">
                {avatarInitials}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{candidate.name}</h1>
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

{/* Tabs - full width */}
        <div className="w-full px-6">
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

{/* Main Content - full width */}
      <div className="w-full p-6 space-y-8">
{/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Left Column - Profile Info (60%) */}
            <div className="lg:col-span-7 flex flex-col gap-8">
{/* CONTACT INFORMATION - THEME FRIENDLY */}
              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
                  👤 Contact Information
                </h2>
                
{isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      {/* Full Name - Editable */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Full Name"
                        />
                      </div>
{/* Email */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <Input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="email@example.com"
                        />
                      </div>
                      {/* Phone */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Phone</label>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      {/* Salary Requirements - Editable */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Salary Requirements</label>
                        <Input
                          value={editForm.salaryRequirements}
                          onChange={(e) => setEditForm({ ...editForm, salaryRequirements: e.target.value })}
                          placeholder="$90k - $120k"
                        />
                      </div>
                      {/* Job Titles - Multiple with add/remove */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Job Title(s)</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {jobTitles.map((title, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                            >
                              {title}
                              <button
                                type="button"
                                onClick={() => handleRemoveJobTitle(title)}
                                className="ml-1 text-blue-600 hover:text-blue-800"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newJobTitle}
                            onChange={(e) => setNewJobTitle(e.target.value)}
                            placeholder="Add job title..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddJobTitle();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddJobTitle}
                          >
                            +
                          </Button>
                        </div>
                      </div>
{/* LinkedIn - now editable */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">LinkedIn</label>
                        <Input
                          value={editForm.linkedin}
                          onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })}
                          placeholder="https://linkedin.com/in/..."
                        />
                      </div>
{/* Full Address - now editable */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Full Address</label>
                        <Input
                          value={editAddress.fullAddress}
                          onChange={(e) => setEditAddress({ ...editAddress, fullAddress: e.target.value })}
                          placeholder="123 Main St, City, State 12345"
                        />
                      </div>
{/* Source - disabled */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Source</label>
                        <Input
                          value={candidate.source || ""}
                          placeholder="Source"
                          disabled
                        />
                      </div>
                      {/* Added - disabled */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Added</label>
                        <Input
                          value={new Date(candidate.createdAt).toLocaleDateString()}
                          disabled
                        />
                      </div>
                    </div>

{/* Skills - editable */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Skills (comma-separated)</label>
                      <Input
                        value={editSkills}
                        onChange={(e) => setEditSkills(e.target.value)}
                        placeholder="React, TypeScript, Node.js, AWS"
                      />
                    </div>

{/* Experience - editable (JSON or text area) */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Experience</label>
                      <Textarea
                        value={(candidate as any).experience?.map((exp: any) => 
                          `${exp.title || ''} at ${exp.company || ''} ${exp.dates || ''}`
                        ).join("\n") || ""}
                        placeholder="Software Engineer at Google 2020-2023"
                        className="min-h-[80px]"
                      />
                    </div>

{/* Education - editable */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Education</label>
                      <Textarea
                        value={(candidate as any).education?.map((edu: any) => 
                          `${edu.degree || ''} at ${edu.school || ''} ${edu.dates || ''}`
                        ).join("\n") || ""}
                        placeholder="BS Computer Science at Stanford"
                        className="min-h-[60px]"
                      />
                    </div>

{/* Certifications - editable */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Certifications (comma-separated)</label>
                      <Input
                        value={(candidate as any).certifications?.join(", ") || ""}
                        placeholder="AWS Solutions Architect, PMP"
                      />
                    </div>

                    {/* Resume URL - editable */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Resume URL</label>
                      <Input
                        value={editForm.resumeUrl}
                        onChange={(e) => setEditForm({ ...editForm, resumeUrl: e.target.value })}
                        placeholder="https://..."
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
                    {/* Full Name Display */}
                    <div>
                      <span className="text-gray-500">Name:</span>{" "}
                      <span className="font-medium">{candidate.name}</span>
                    </div>
                    {/* Email Display */}
                    <div>
                      <span className="text-gray-500">Email:</span>{" "}
                      <a
                        href={`mailto:${candidate.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {candidate.email || "—"}
                      </a>
                    </div>
                    {/* Phone Display */}
                    <div>
                      <span className="text-gray-500">Phone:</span> {candidate.phone || "—"}
                    </div>
                    {/* Salary Requirements Display */}
                    <div>
                      <span className="text-gray-500">Salary:</span>{" "}
                      <span className="font-medium">{(candidate as any).salaryRequirements || "—"}</span>
                    </div>
                    {/* Job Titles Display */}
                    <div className="col-span-1 sm:col-span-2">
                      <span className="text-gray-500">Title(s):</span>{" "}
                      {jobTitles.length > 0 ? (
                        <div className="inline-flex flex-wrap gap-1">
                          {jobTitles.map((title, index) => (
                            <span
                              key={index}
                              className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs"
                            >
                              {title}
                            </span>
                          ))}
                        </div>
                      ) : "—"}
                    </div>
                    {/* Location Display */}
                    <div>
                      <span className="text-gray-500">Location:</span> {candidate.location || "—"}
                    </div>
                    {/* Full Address Display */}
                    <div>
                      <span className="text-gray-500">Address:</span>{" "}
                      <span className="text-sm">{(candidate as any).fullAddress || "—"}</span>
                    </div>
                    {/* LinkedIn Display */}
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
                    {/* Source Display */}
                    <div>
                      <span className="text-gray-500">Source:</span> {candidate.source || "—"}
                    </div>
                    {/* Added Display */}
                    <div>
                      <span className="text-gray-500">Added:</span>{" "}
                      {new Date(candidate.createdAt).toLocaleDateString()}
                    </div>
{/* Summary Display */}
                    {(candidate as any).summary && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <span className="text-gray-500">Summary:</span>{" "}
                        <p className="text-sm mt-1">{(candidate as any).summary}</p>
                      </div>
                    )}

                    {/* Skills Display */}
                    {(candidate as any).skills && (candidate as any).skills.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <span className="text-gray-500">Skills:</span>{" "}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(candidate as any).skills.map((skill: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

{/* Experience Display */}
                    {(candidate as any).experience && (candidate as any).experience.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <span className="text-gray-500">Experience:</span>{" "}
                        <div className="space-y-2 mt-1">
                          {(candidate as any).experience.map((exp: any, idx: number) => (
                            <div key={idx} className="text-sm border-l-2 border-blue-300 pl-3">
                              <p className="font-medium">{exp.title || exp.company}</p>
                              <p className="text-xs text-gray-500">
                                {exp.company} {exp.dates ? `• ${exp.dates}` : ''}
                              </p>
                              {exp.description && (
                                <p className="text-xs text-gray-600 mt-1">{exp.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

{/* Education Display */}
                    {(candidate as any).education && (candidate as any).education.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <span className="text-gray-500">Education:</span>{" "}
                        <div className="space-y-2 mt-1">
                          {(candidate as any).education.map((edu: any, idx: number) => (
                            <div key={idx} className="text-sm">
                              <p className="font-medium">{edu.degree || edu.school}</p>
                              <p className="text-xs text-gray-500">
                                {edu.school} {edu.dates ? `• ${edu.dates}` : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

{/* Certifications Display */}
                    {(candidate as any).certifications && (candidate as any).certifications.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <span className="text-gray-500">Certifications:</span>{" "}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(candidate as any).certifications.map((cert: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

{/* Linked Jobs Section */}
              <LinkedJobsSection candidateId={candidate.id} candidateName={candidate.name} />

{/* Resume Section - Quick View - REMOVED per user request */}

{/* TIMELINE - Styled like EventTimeline - Matching Contact Information format */}
<div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-xl font-semibold">Timeline</h3>
    <Badge variant="outline">{notes?.length || 0} entries</Badge>
  </div>

  {/* Add Note Form - Matching EventTimeline style */}
  <div className="border border-border rounded-lg p-4 mb-6 bg-background">
    <div className="mb-3">
      <label className="text-sm font-medium mb-2 block">Note Type</label>
      <select
        value={noteType}
        onChange={(e) => setNoteType(e.target.value)}
        className="w-full p-2 text-sm border border-input rounded-md bg-background"
      >
        {noteTypes.map((type: any) => (
          <option key={type.value} value={type.value}>{type.label}</option>
        ))}
      </select>
    </div>

    <div className="mb-3">
      <label className="text-sm font-medium mb-2 block">Notes</label>
      <Textarea
        placeholder="Add a note..."
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        rows={2}
        className="w-full p-2 text-sm border border-input rounded-md resize-y min-h-[60px]"
      />
    </div>
    <button 
      onClick={handleAddNote} 
      disabled={addingNote || !newNote.trim()}
      className="w-full py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {addingNote ? 'Adding...' : 'Add Note'}
    </button>
  </div>

{/* Activity List - Matching EventTimeline styling */}
  <div className="space-y-4">
    {notes && notes.length > 0 ? (
      notes.map((note: any, index: number) => {
        // Color mapping - matching EventTimeline getEventColor function
        const noteColors: Record<string, string> = {
          'NOTE': 'bg-yellow-100 text-yellow-800',
          'general': 'bg-yellow-100 text-yellow-800',
          'phone_call': 'bg-green-100 text-green-800',
          'email_sent': 'bg-blue-100 text-blue-800',
          'EMAIL_SENT': 'bg-blue-100 text-blue-800',
          'meeting': 'bg-purple-100 text-purple-800',
          'follow_up': 'bg-orange-100 text-orange-800',
          'proposal_sent': 'bg-indigo-100 text-indigo-800',
          'contract_signed': 'bg-emerald-100 text-emerald-800',
          'placement_made': 'bg-green-100 text-green-800',
          'check_in': 'bg-cyan-100 text-cyan-800',
          'other': 'bg-gray-100 text-gray-800',
          'RESUME_UPLOADED': 'bg-red-100 text-red-800',
          'STATUS_CHANGED': 'bg-purple-100 text-purple-800',
          'STAGE_CHANGED': 'bg-violet-100 text-violet-800',
          'INTERVIEW_SCHEDULED': 'bg-green-100 text-green-800',
          'CANDIDATE_VIEWED': 'bg-gray-100 text-gray-800',
          'CANDIDATE_CREATED': 'bg-slate-100 text-slate-800',
        };
        const labelMap: Record<string, string> = {
          'NOTE': 'Note',
          'general': 'Note',
          'phone_call': 'Phone Call',
          'email_sent': 'Email Sent',
          'EMAIL_SENT': 'Email Sent',
          'meeting': 'Meeting',
          'follow_up': 'Follow-up',
          'proposal_sent': 'Proposal Sent',
          'contract_signed': 'Contract Signed',
          'placement_made': 'Placement Made',
          'check_in': 'Check-in',
          'other': 'Other',
          'RESUME_UPLOADED': 'Resume',
          'STATUS_CHANGED': 'Status Changed',
          'STAGE_CHANGED': 'Stage Changed',
          'INTERVIEW_SCHEDULED': 'Interview',
          'CANDIDATE_VIEWED': 'Viewed',
          'CANDIDATE_CREATED': 'Added',
        };
        const noteTypeValue = note.eventType || note.noteType || 'other';
        const eventColor = noteColors[noteTypeValue] || noteColors['other'];
        const eventLabel = labelMap[noteTypeValue] || 'Event';
        
        return (
          <div key={note.id || index} className="flex gap-3 border-l-2 border-border pl-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${eventColor}`}>
              {noteTypeValue === 'phone_call' ? '📞' : 
               noteTypeValue === 'email_sent' || noteTypeValue === 'EMAIL_SENT' ? '📧' : 
               noteTypeValue === 'meeting' || noteTypeValue === 'INTERVIEW_SCHEDULED' ? '📅' :
               noteTypeValue === 'RESUME_UPLOADED' ? '📄' :
               noteTypeValue === 'STATUS_CHANGED' || noteTypeValue === 'STAGE_CHANGED' ? '🔄' :
               noteTypeValue === 'CANDIDATE_CREATED' ? '✨' :
               noteTypeValue === 'CANDIDATE_VIEWED' ? '👁' : '📝'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${eventColor}`}>
                  {eventLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(note.createdAt || note.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm text-foreground">
                {note.description || note.title || note.noteText || 'Note'}
              </div>
              {note.noteType && note.noteType !== 'general' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Type: {note.noteType}
                </p>
              )}
            </div>
          </div>
        );
      })
    ) : (
      <div className="p-8 text-center text-muted-foreground">
        No activity yet
      </div>
    )}
  </div>
</div>
            </div>

{/* Right Column - Resume Viewer (40%) */}
            <div className="lg:col-span-5">
              <div className="sticky top-24">
                <Card className="h-[calc(100vh-120px)] flex flex-col">
<CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" /> Resume
                    </CardTitle>
                    {currentResumeUrl && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {candidate.resumeFileName || "resume.pdf"}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 p-0 overflow-hidden">
                    {currentResumeUrl ? (
                      <ResumeViewer 
                        url={currentResumeUrl} 
                        candidateId={candidate.id}
                        className="h-full"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No resume uploaded yet
                      </div>
                    )}
                  </CardContent>

                  {/* Action Buttons */}
<div className="p-4 border-t flex gap-3">
                      <ResumeUpload
                        candidateId={candidate.id}
                        onSuccess={handleResumeReplace}
                        buttonText="Replace Resume"
                        className="flex-1"
                      />
                    {currentResumeUrl && (
                      <Button 
                        variant="destructive" 
                        onClick={handleDeleteResume}
                        className="flex-1"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Resume
                      </Button>
                    )}
                  </div>
                </Card>
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
        {activeTab === "resume" && (
          <ResumeTab 
            candidateId={candidate.id} 
            resumeUrl={candidate.resumeUrl} 
            candidateName={candidate.name}
          />
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
  // Use app-centric hook to get linked jobs from candidate's linkedJobs[]
  const { data: linkedJobsData, isLoading, isError, refetch } = useLinkedJobsForCandidate(candidateId);
  const updateStage = useUpdateCandidateStageInJobAppCentric();
  const linkCandidate = useLinkCandidateToJobAppCentric();
  const unlinkCandidate = useUnlinkCandidateFromJobAppCentric();
  const addNote = useAddJobSpecificNote();
  const { data: allJobs } = useJobs();
  
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [jobToUnlink, setJobToUnlink] = useState<any>(null);
  
  // Auto-prompt for stage change
  const [showStagePrompt, setShowStagePrompt] = useState(false);
  const [pendingStageChange, setPendingStageChange] = useState<{ jobId: string; jobTitle: string; oldStage: string; newStage: string } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [isSavingStage, setIsSavingStage] = useState(false);

  const getCurrentStage = (linkedJob: any) => {
    return linkedJob?.stage || "sourced";
  };

  // Get stage label from value
  const getStageLabel = (stageValue: string): string => {
    const stage = APPLICATION_STAGES.find(s => s.value === stageValue);
    return stage?.label || stageValue;
  };

  // Handle stage change with auto-prompt
  const handleStageChange = async (job: any, newStage: string) => {
    const currentStage = getCurrentStage(job);
    if (newStage === currentStage) return;
    
    // Store the pending stage change and show prompt
    setPendingStageChange({
      jobId: job.id,
      jobTitle: job.title || "Untitled Job",
      oldStage: currentStage,
      newStage: newStage
    });
    setShowStagePrompt(true);
    setStageNote("");
  };

  // Confirm stage change (with or without note)
  const handleConfirmStageChange = async () => {
    if (!pendingStageChange) return;
    
    setIsSavingStage(true);
    try {
      // Update the stage
      await updateStage.mutateAsync({
        jobId: pendingStageChange.jobId,
        candidateId,
        stage: pendingStageChange.newStage,
      });
      
      // If note was provided, add it
      if (stageNote.trim()) {
        await addNote.mutateAsync({
          jobId: pendingStageChange.jobId,
          candidateId,
          content: stageNote.trim(),
          relatedStage: pendingStageChange.newStage,
        });
      }
      
      toast.success(`Stage updated to ${getStageLabel(pendingStageChange.newStage)}`);
      setShowStagePrompt(false);
      setPendingStageChange(null);
      setStageNote("");
      refetch();
    } catch (err: any) {
      console.error('Stage change error:', err);
      toast.error(err.message || 'Failed to update stage');
    } finally {
      setIsSavingStage(false);
    }
  };

  // Skip the note and just update stage
  const handleSkipNote = async () => {
    if (!pendingStageChange) return;
    
    setIsSavingStage(true);
    try {
      await updateStage.mutateAsync({
        jobId: pendingStageChange.jobId,
        candidateId,
        stage: pendingStageChange.newStage,
      });
      
      toast.success(`Stage updated to ${getStageLabel(pendingStageChange.newStage)}`);
      setShowStagePrompt(false);
      setPendingStageChange(null);
      setStageNote("");
      refetch();
    } catch (err: any) {
      console.error('Stage change error:', err);
      toast.error(err.message || 'Failed to update stage');
    } finally {
      setIsSavingStage(false);
    }
  };

  // Close stage prompt without doing anything
  const handleCloseStagePrompt = () => {
    setShowStagePrompt(false);
    setPendingStageChange(null);
    setStageNote("");
  };

  // Use APPLICATION_STAGES for stage options
  const stageOptions = APPLICATION_STAGES;

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

  const handleUnlinkJob = async () => {
    if (!jobToUnlink) return;
    
    try {
      await unlinkCandidate.mutateAsync({
        jobId: jobToUnlink.id,
        candidateId,
      });
      toast.success('Job unlinked successfully');
      setShowUnlinkDialog(false);
      setJobToUnlink(null);
      refetch();
    } catch (err: any) {
      console.error('Unlink job error:', err);
      toast.error(err.message || 'Failed to unlink job');
    }
  };

  const confirmUnlink = (job: any) => {
    setJobToUnlink(job);
    setShowUnlinkDialog(true);
  };

return (
    <div className="bg-card border border-border rounded-xl p-6">
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

{isLoading && <p className="text-sm text-muted-foreground">Loading linked jobs...</p>}
      {isError && <p className="text-sm text-destructive">Failed to load linked jobs.</p>}

      {!isLoading && !isError && (!jobs || jobs.length === 0) && (
        <div className="bg-background border border-border rounded-xl p-8 text-center text-muted-foreground">
          No jobs linked yet. Click "Link Job" to link this candidate to a job.
        </div>
      )}

      {!isLoading && !isError && jobs && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const currentStage = getCurrentStage(job);

            return (
<div key={job.id} className="bg-background border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm text-foreground">{job.title || "Untitled Job"}</p>
                  <p className="text-xs text-muted-foreground">{job.companyName || "Company"}</p>
                </div>

<div className="flex items-center gap-2">
<select
                    value={currentStage}
                    onChange={(e) => handleStageChange(job, e.target.value)}
                    className="border border-input rounded-md px-2 py-1 text-sm bg-background text-foreground"
                    disabled={updateStage.isPending}
                  >
                    {stageOptions.map((stage: any) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>

                  <Button variant="outline" size="sm" asChild>
                    <a href={`/dashboard/jobs/${job.id}`}>View Job</a>
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => confirmUnlink(job)}
                    disabled={unlinkCandidate.isPending}
                  >
                    Unlink
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
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4 text-foreground">Link Job to Candidate</h3>
            
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Select Job</label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground"
              >
                <option value="">Choose a job...</option>
                {availableJobs.map((job: any) => (
                  <option key={job.id} value={job.id} className="bg-background text-foreground">
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

{/* Unlink Job Confirmation Dialog */}
      {showUnlinkDialog && jobToUnlink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4 text-foreground">Unlink Job</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to unlink <span className="font-medium text-foreground">{jobToUnlink.title}</span> from this candidate? This will remove the candidate from this job's pipeline.
            </p>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowUnlinkDialog(false);
                  setJobToUnlink(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleUnlinkJob}
                disabled={unlinkCandidate.isPending}
              >
                {unlinkCandidate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Unlinking...
                  </>
                ) : (
                  'Unlink'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Change Prompt Modal */}
      {showStagePrompt && pendingStageChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-2 text-foreground">Stage Changed</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You changed the stage to <span className="font-medium text-foreground">{getStageLabel(pendingStageChange.newStage)}</span> for <span className="font-medium text-foreground">{pendingStageChange.jobTitle}</span>.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Would you like to add a note about this change?
            </p>
            
            <div className="mb-4">
              <Textarea
                placeholder="Add a note (optional)..."
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                rows={3}
                className="w-full p-2 text-sm border border-input rounded-md resize-y min-h-[60px]"
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={handleSkipNote}
                disabled={isSavingStage}
              >
                {isSavingStage ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Skip
              </Button>
              <Button 
                onClick={handleConfirmStageChange}
                disabled={isSavingStage}
              >
                {isSavingStage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full Linked Jobs Tab
function LinkedJobsTab({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const { data: jobs, isLoading, isError, refetch } = useJobsForCandidate(candidateId);
  const updateStage = useUpdateCandidateStageInJob();
  const unlinkCandidate = useUnlinkCandidateFromJob();
  
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [jobToUnlink, setJobToUnlink] = useState<any>(null);

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

  // Unlink job handlers
  const handleUnlinkJob = async () => {
    if (!jobToUnlink) return;
    
    try {
      await unlinkCandidate.mutateAsync({
        jobId: jobToUnlink.id,
        candidateId,
      });
      toast.success('Job unlinked successfully');
      setShowUnlinkDialog(false);
      setJobToUnlink(null);
      refetch();
    } catch (err: any) {
      console.error('Unlink job error:', err);
      toast.error(err.message || 'Failed to unlink job');
    }
  };

  const confirmUnlink = (job: any) => {
    setJobToUnlink(job);
    setShowUnlinkDialog(true);
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
      <div className="bg-card border border-border p-6 rounded-xl">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading linked jobs...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-card border border-border p-6 rounded-xl">
        <p className="text-red-600">Failed to load linked jobs.</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-card border border-border p-6 rounded-xl text-center py-12">
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
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
                      <a href={`/dashboard/jobs/${job.id}`}>View Job</a>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs text-red-500 hover:text-red-700"
                      onClick={() => confirmUnlink(job)}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
              {stageJobs.length === 0 && (
                <p className="text-xs text-gray-400 italic">Drop here</p>
              )}
            </div>
</div>
        ))}
      </div>

      {/* Unlink Job Confirmation Dialog */}
      {showUnlinkDialog && jobToUnlink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4 text-foreground">Unlink Job</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to unlink <span className="font-medium text-foreground">{jobToUnlink.title}</span> from this candidate? This will remove the candidate from this job's pipeline.
            </p>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowUnlinkDialog(false);
                  setJobToUnlink(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleUnlinkJob}
                disabled={unlinkCandidate.isPending}
              >
                {unlinkCandidate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Unlinking...
                  </>
                ) : (
                  'Unlink'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Resume Tab with upload functionality
function ResumeTab({ candidateId, resumeUrl, candidateName }: { candidateId: string; resumeUrl?: string; candidateName: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Log resume upload as event
  const logResumeUploadEvent = async (fileName: string, newResumeUrl: string) => {
    try {
      const response = await fetch(`/api/candidate/${candidateId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'RESUME_UPLOADED',
          title: 'Resume Uploaded',
          description: `Resume "${fileName}" was uploaded`,
          metadata: {
            fileName,
            resumeUrl: newResumeUrl,
            uploadedAt: new Date().toISOString(),
          }
        })
      });
      if (!response.ok) {
        console.error('Failed to log resume upload event');
      }
    } catch (err) {
      console.error('Error logging resume upload event:', err);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const validExtensions = ['.pdf', '.docx'];
      const fileNameLower = file.name.toLowerCase();
      
      const hasValidType = validTypes.includes(file.type);
      const hasValidExtension = validExtensions.some(ext => fileNameLower.endsWith(ext));
      
      if (!hasValidType && !hasValidExtension) {
        toast.error('Invalid file type. Please upload PDF or Word (.docx) files.');
        return;
      }
      
      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 10MB.');
        return;
      }
      
      setSelectedFile(file);
    }
  };

const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    
    try {
      // Step 1: Parse the resume first to extract all fields
      console.log('[ResumeUpload] Step 1: Starting parse...');
      const parseFormData = new FormData();
      parseFormData.append('resume', selectedFile);
      
      const parseResponse = await fetch('/api/parse-resume', {
        method: 'POST',
        body: parseFormData,
      });
      
      const parseResult = await parseResponse.json();
      console.log('[ResumeUpload] Parse result:', JSON.stringify(parseResult).substring(0, 500));
      
      if (!parseResponse.ok || parseResult.error) {
        console.error('[ResumeUpload] Parse failed:', parseResult.error);
        throw new Error(parseResult.error || 'Failed to parse resume');
      }
      
      // Step 2: Upload to S3 via API (if parsing succeeded, use the file)
console.log('[ResumeUpload] Step 2: Uploading to S3, candidateId:', candidateId);
      const uploadFormData = new FormData();
      uploadFormData.append('resume', selectedFile);
      uploadFormData.append('candidateId', candidateId);
      
      const uploadResponse = await fetch('/api/upload-resume', {
        method: 'POST',
        body: uploadFormData,
      });
      
      const uploadResult = await uploadResponse.json();
      console.log('[ResumeUpload] Upload result:', JSON.stringify(uploadResult).substring(0, 500));
      
      if (!uploadResponse.ok || uploadResult.error) {
        console.error('[ResumeUpload] Upload failed:', uploadResult.error);
        throw new Error(uploadResult.error || 'Failed to upload resume');
      }
      
      const newResumeUrl = uploadResult.resumeUrl;
      
      // Build update payload with all parsed fields
      const updatePayload: any = {
        resume_url: newResumeUrl,
      };
      
// Add parsed fields if available - map camelCase to snake_case for database
      if (parseResult.success && parseResult.resume) {
        const parsed = parseResult.resume;
        if (parsed.name) updatePayload.name = parsed.name;
        if (parsed.email) updatePayload.email = parsed.email;
        if (parsed.phone) updatePayload.phone = parsed.phone;
        if (parsed.title) updatePayload.title = parsed.title;
        if (parsed.location) updatePayload.location = parsed.location;
        // full_address (snake_case for database)
        if (parsed.fullAddress) updatePayload.full_address = parsed.fullAddress;
        if (parsed.linkedin) updatePayload.linkedin_url = parsed.linkedin;
        // salary_requirements (snake_case for database)
        if (parsed.salaryRequirements) updatePayload.salary_requirements = parsed.salaryRequirements;
        if (parsed.summary) updatePayload.summary = parsed.summary;
        if (parsed.skills && parsed.skills.length > 0) updatePayload.skills = parsed.skills;
        if (parsed.experience && parsed.experience.length > 0) updatePayload.experience = parsed.experience;
        if (parsed.education && parsed.education.length > 0) updatePayload.education = parsed.education;
        if (parsed.certifications && parsed.certifications.length > 0) updatePayload.certifications = parsed.certifications;
      }
      
      // Update candidate record with all parsed fields
      const updateResponse = await fetch(`/api/data/leads/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      
      const updateResult = await updateResponse.json();
      
      if (!updateResponse.ok || updateResult.error) {
        throw new Error(updateResult.error || 'Failed to update candidate');
      }
      
      // Log the resume upload as an event
      await logResumeUploadEvent(selectedFile.name, newResumeUrl);
      
      toast.success('Resume uploaded and parsed successfully');
      setSelectedFile(null);
      
      // Refresh the page to show new resume
      window.location.reload();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Failed to upload resume');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden h-[720px] flex flex-col">
      <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" /> Resume
        </h2>
        
        {/* Upload Section */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.docx"
            className="hidden"
            id="resume-upload"
          />
          <label htmlFor="resume-upload">
            <span className=" cursor-pointer">
              <Button variant="outline" size="sm" asChild component="span">
                <span>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload New
                </span>
              </Button>
            </span>
          </label>
          
          {resumeUrl && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.open(resumeUrl, "_blank")}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button variant="default" size="sm" asChild>
                <a
                  href={resumeUrl}
                  download={resumeUrl.split("/").pop() || `${candidateName.replace(/ /g, "-")}-resume.pdf`}
                  target="_blank"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Upload Progress/Preview */}
      {selectedFile && (
        <div className="p-4 border-b bg-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
<FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelUpload}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Resume Viewer */}
      {resumeUrl ? (
        <ResumeViewer
          url={resumeUrl}
          fileName={resumeUrl?.split("/").pop() || `${candidateName.replace(/ /g, "-")}-resume.pdf`}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No Resume</p>
            <p className="text-sm text-gray-400 mt-1">
              Upload a resume to view it here.
            </p>
            <div className="mt-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx"
                className="hidden"
                id="resume-upload-empty"
              />
              <label htmlFor="resume-upload-empty">
                <Button variant="outline" asChild component="span">
                  <span className="cursor-pointer">
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Resume
                  </span>
                </Button>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
