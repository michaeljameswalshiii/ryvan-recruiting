/**
 * Candidates Page
 * Shows saved candidates from DB + allows adding new ones + moving through pipeline
 * Supports drag-and-drop to move candidates between stages
 */

"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, User, Mail, Phone, Linkedin, MapPin, Briefcase, Search, ExternalLink, FileText, X, Loader2, ChevronRight, Send, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLeads, useCreateLead, useUpdateLead, useUpdateLeadStatus, leadKeys } from "@/lib/hooks/query-lead";
import { toast } from "sonner";
import { SendEmailModal, CandidateInfo } from "@/components/email/send-email-modal";
import CandidateEditModal from "@/components/candidate-edit-modal";
import { Pencil } from "lucide-react";
// Drag and drop imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface Candidate {
  id: string;
  name: string;
  title?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  notes?: string;
  source?: string;
  status?: string;
}

// Configurable pipeline stages - can be changed here
// New stages as per requirements
const pipelineStages = [
  { id: "identification", label: "Identification", color: "bg-blue-500" },
  { id: "outreach", label: "Attempted Outreach", color: "bg-yellow-500" },
  { id: "conversation", label: "Conversation", color: "bg-purple-500" },
  { id: "presented", label: "Candidate Presented", color: "bg-indigo-500" },
  { id: "interview", label: "Interview", color: "bg-orange-500" },
  { id: "accept", label: "Accept", color: "bg-green-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];

// Stage order for advancement/regression
const stageOrder = [
  "identification",
  "outreach",
  "conversation",
  "presented",
  "interview",
  "accept",
  "rejected",
];

// Legacy status mapping - maps old statuses to pipeline stages
// This ensures legacy data shows correctly in the pipeline
function mapLegacyStatus(status?: string): string {
  if (!status) return "identification";
  
  // Already a valid pipeline stage
  if (pipelineStages.find(s => s.id === status)) {
    return status;
  }
  
  // Legacy "new" status -> identification
  if (status === "new") {
    return "identification";
  }
  
  // Legacy "converted" status -> accept (converted to client)
  if (status === "converted") {
    return "accept";
  }
  
  // Other legacy statuses -> identification
  return "identification";
}

// Drop animation config
const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.5",
      },
    },
  }),
};

// Sortable Candidate Card Component
function SortableCandidateCard({
  candidate,
  onStatusChange,
  isPending,
  onSendEmail,
  onRefresh,
}: {
  candidate: Candidate;
  onStatusChange: (candidateId: string, newStatus: string) => void;
  isPending: boolean;
  onSendEmail?: (candidate: Candidate) => void;
  onRefresh: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: candidate.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Get stage label from status
  const stageLabel =
    pipelineStages.find((s) => s.id === candidate.status)?.label || candidate.status || "New";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-lg border border-border bg-background hover:border-primary transition-colors ${
        isDragging ? "opacity-50 ring-2 ring-primary" : ""
      }`}
    >
<div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link 
            href={`/candidates/${candidate.id}`}
            className="font-medium text-sm truncate hover:text-primary transition-colors"
          >
            {candidate.name}
          </Link>
          {candidate.title && (
            <p className="text-xs text-muted-foreground truncate">
              {candidate.title}
            </p>
          )}
          {candidate.location && (
            <p className="text-xs text-muted-foreground truncate">
              {candidate.location}
            </p>
          )}
        </div>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
          title="Drag to move"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

{/* Status Badge */}
      <Badge
        variant="outline"
        className="mt-2 text-xs capitalize"
      >
        {stageLabel}
      </Badge>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-1 mt-2">
        {candidate.email && (
          <button
            type="button"
            onClick={() => onSendEmail?.(candidate)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            title="Send Email"
          >
            <Mail className="h-3 w-3" />
            <span>Email</span>
          </button>
        )}
<CandidateEditModal
          candidate={candidate}
          onSave={onRefresh}
        >
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title="Edit Candidate"
          >
            <Pencil className="h-3 w-3" />
            <span>Edit</span>
          </button>
        </CandidateEditModal>
      </div>
    </div>
  );
}

// Column Component (Droppable)
function StageColumn({
  stage,
  candidates,
  onStatusChange,
  isPending,
  onSendEmail,
  onRefresh,
}: {
  stage: { id: string; label: string; color: string };
  candidates: Candidate[];
  onStatusChange: (candidateId: string, newStatus: string) => void;
  isPending: boolean;
  onSendEmail?: (candidate: Candidate) => void;
  onRefresh: () => void;
}) {
  // Make the column droppable using the stage id
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`rounded-lg border border-border bg-card min-h-[400px] flex flex-col transition-colors ${
        isOver ? 'border-primary bg-accent/20' : ''
      }`}
    >
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{stage.label}</h3>
          <Badge variant="secondary" className="text-xs">
            {candidates.length || 0}
          </Badge>
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto">
        <SortableContext
          items={candidates.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
{candidates.map((candidate) => (
            <SortableCandidateCard
              key={candidate.id}
              candidate={candidate}
              onStatusChange={onStatusChange}
              isPending={isPending}
              onSendEmail={onSendEmail}
              onRefresh={onRefresh}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateInfo | null>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Setup sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

// Fetch saved leads from DB
  const { data: leads = [], isLoading, error } = useLeads();
  const createLeadMutation = useCreateLead();
  const updateLeadMutation = useUpdateLead();
  const updateLeadStatusMutation = useUpdateLeadStatus();

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

// Handle drag end - update status when dropped in different column
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const candidateId = active.id as string;
    const oldCandidate = candidates.find((c) => c.id === candidateId);

    if (!oldCandidate) return;

    // Find which stage the candidate was dropped over
    // Check if over is a container (stage column)
    let newStatus: string | null = null;

    // If dropped over a stage column (check by id matching stage id)
    const overStage = pipelineStages.find((s) => s.id === over.id);
    if (overStage) {
      newStatus = overStage.id;
    } else {
      // Dropped over another candidate - find their stage
      const overCandidate = candidates.find((c) => c.id === over.id);
      if (overCandidate && overCandidate.status) {
        newStatus = overCandidate.status;
      }
    }

    // Also check if the 'over' id contains stage info (for column drop zones)
    if (!newStatus) {
      for (const stage of pipelineStages) {
        if (over.id.toString().startsWith(`column-${stage.id}`)) {
          newStatus = stage.id;
          break;
        }
      }
    }

    // Default to identification if no valid status found
    if (!newStatus || !pipelineStages.find((s) => s.id === newStatus)) {
      newStatus = "identification";
    }

    // Get the current status from oldCandidate (already mapped)
    const oldStatus = oldCandidate.status || "identification";

    // Only update if status actually changed
    if (newStatus && newStatus !== oldStatus) {
      try {
        // Optimistically update the UI by invalidating queries after mutation
        await updateLeadStatusMutation.mutateAsync({
          leadId: candidateId,
          newStatus,
          oldStatus,
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
        
        toast.success(`Moved to ${pipelineStages.find((s) => s.id === newStatus)?.label || newStatus}`);
      } catch (err: any) {
        console.error("Failed to update candidate status:", err);
        toast.error(`Failed to move: ${err.message}`);
      }
    }
  };

// Add Candidate Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    location: "",
    linkedin_url: "",
    notes: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter candidates based on search
  const filteredCandidates = leads.filter((lead: any) =>
    lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

// Convert DB lead to Candidate interface
  // Default to "identification" for candidates with null/empty status
  // Use mapLegacyStatus to ensure legacy statuses display correctly
  const candidates: Candidate[] = filteredCandidates.map((l: any) => ({
    id: l.id,
    name: l.name || "",
    title: l.title || "",
    location: l.location || "",
    email: l.email || "",
    phone: l.phone || "",
    linkedin_url: l.linkedin_url || "",
    notes: l.notes || "",
    source: l.source || "",
    status: mapLegacyStatus(l.status),
  }));

  // Group candidates by status for pipeline view
  const candidatesByStage = pipelineStages.reduce((acc, stage) => {
    acc[stage.id] = candidates.filter(c => c.status === stage.id);
    return acc;
  }, {} as Record<string, Candidate[]>);

  const handleAddCandidate = async () => {
    if (!formData.name) return;

    try {
      const formDataToSend = new FormData();
      formDataToSend.set("name", formData.name);
      formDataToSend.set("email", formData.email);
      formDataToSend.set("phone", formData.phone);
      formDataToSend.set("title", formData.title);
      formDataToSend.set("location", formData.location);
      formDataToSend.set("linkedin_url", formData.linkedin_url);
      formDataToSend.set("notes", formData.notes);
formDataToSend.set("source", "manual_entry");
      // Default to "identification" stage so new candidates show in the first column
      formDataToSend.set("status", "identification");

      if (resumeFile) {
        formDataToSend.set("resume", resumeFile);
      }

      await createLeadMutation.mutateAsync(formDataToSend);

      toast.success(`${formData.name} added successfully!`);
      setIsAddDialogOpen(false);
      setFormData({ name: "", email: "", phone: "", title: "", location: "", linkedin_url: "", notes: "" });
      setResumeFile(null);
    } catch (err: any) {
      console.error("Failed to add candidate:", err);
      toast.error(`Failed to add candidate: ${err.message}`);
    }
  };

  const moveToStage = async (candidateId: string, newStatus: string) => {
    try {
      const formData = new FormData();
      formData.set("status", newStatus);

      await updateLeadMutation.mutateAsync({ leadId: candidateId, formData });
      toast.success("Candidate moved to next stage");
    } catch (err: any) {
      console.error("Failed to update candidate:", err);
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const advanceStage = (currentStatus: string) => {
    const currentIndex = stageOrder.indexOf(currentStatus);
    if (currentIndex < stageOrder.length - 1) {
      return stageOrder[currentIndex + 1];
    }
    return currentStatus;
  };

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type - accept PDF and Word documents
    const fileNameLower = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || fileNameLower.endsWith('.pdf');
    const isWord = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                  fileNameLower.endsWith('.docx');
    
    if (!isPdf && !isWord) {
      toast.error("Please upload a PDF or Word (.docx) file");
      return;
    }

    setResumeFile(file);
    setIsParsingResume(true);

    try {
      // Capture current form state before creating local FormData to avoid type confusion
      const currentFormState = { ...formData };
      
      const fileFormData = new FormData();
      fileFormData.append("resume", file);

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: fileFormData,
      });

      const result = await res.json();

      if (result.success && result.resume) {
        setFormData({
          name: result.resume.name || currentFormState.name,
          email: result.resume.email || "",
          phone: result.resume.phone || "",
          title: result.resume.title || "",
          location: result.resume.location || "",
          linkedin_url: result.resume.linkedin || "",
          notes: currentFormState.notes,
        });
        const methodText = result.extractionMethod ? ` (${result.extractionMethod})` : '';
        toast.success(`Resume parsed successfully!${methodText} Fields have been filled.`);
      } else if (result.error) {
        toast.error(result.error);
      } else {
        // Even if parsing failed, don't show error - user can enter manually
        console.log("Resume parse result:", result);
      }
    } catch (err) {
      console.error("Error parsing resume:", err);
      toast.error("Error parsing resume");
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", title: "", location: "", linkedin_url: "", notes: "" });
    setResumeFile(null);
    setIsParsingResume(false);
  };

  // Handle send email - opens the email modal for a candidate
  const handleSendEmail = (candidate: Candidate) => {
    if (candidate.email && candidate.name) {
      setSelectedCandidate({
        email: candidate.email,
        name: candidate.name
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidates pipeline.</p>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {pipelineStages.map((stage) => (
            <div key={stage.id} className="p-4 rounded-lg border border-border bg-card min-h-[300px]">
              <Skeleton className="h-6 w-20 mb-4" />
              <Skeleton className="h-24 w-full mb-2" />
              <Skeleton className="h-24 w-full mb-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidates pipeline.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load candidates: {error.message}
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            Manage your candidates pipeline. Move them through stages.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createLeadMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createLeadMutation.isPending ? "Adding..." : "Add Candidate"}
          </Button>
        </div>
      </div>

{/* Add Candidate Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Candidate"
        description="Add a new candidate to your pipeline. New candidates start in Identification stage."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCandidate}
              disabled={!formData.name || createLeadMutation.isPending}
            >
              {createLeadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Candidate
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Smith"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="title">Job Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Senior Software Engineer"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Miami, FL"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="linkedin">LinkedIn URL</Label>
            <Input
              id="linkedin"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              placeholder="https://linkedin.com/in/johnsmith"
            />
          </div>
<div className="grid gap-2">
            <Label htmlFor="resume">Resume (PDF or Word)</Label>
            <div className="flex items-center gap-4">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.docx"
                onChange={handleFileChange}
                className="hidden"
                disabled={isParsingResume}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingResume}
              >
                <FileText className="mr-2 h-4 w-4" />
                {resumeFile ? "Change File" : "Upload Resume"}
              </Button>
              {resumeFile && !isParsingResume && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  {resumeFile.name}
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="p-1 hover:bg-accent rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {isParsingResume && (
                <div className="text-sm text-blue-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing resume with AI...
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this candidate..."
            />
          </div>
        </div>
      </SimpleDialog>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search candidates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

{/* Pipeline Columns with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-7 gap-2">
          {pipelineStages.map((stage) => {
            const stageCandidates = candidatesByStage[stage.id] || [];
return (
<StageColumn
                key={stage.id}
                stage={stage}
                candidates={stageCandidates}
                onStatusChange={() => {}}
                isPending={updateLeadStatusMutation.isPending}
                onSendEmail={handleSendEmail}
                onRefresh={handleRefresh}
              />
            );
          })}
        </div>

        {/* Drag Overlay for visual feedback */}
        <DragOverlay dropAnimation={dropAnimation}>
          {activeId ? (
            <div className="p-3 rounded-lg border-2 border-primary bg-background shadow-lg opacity-90">
              {(() => {
                const candidate = candidates.find((c) => c.id === activeId);
                if (!candidate) return null;
                return (
                  <>
                    <h4 className="font-medium text-sm truncate">{candidate.name}</h4>
                    {candidate.title && (
                      <p className="text-xs text-muted-foreground truncate">
                        {candidate.title}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {candidates.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No candidates yet.</p>
<Button onClick={() => setIsAddDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Candidate
          </Button>
        </div>
      )}

      {/* Send Email Modal */}
      <SendEmailModal
        open={!!selectedCandidate}
        onOpenChange={(open) => !open && setSelectedCandidate(null)}
        candidate={selectedCandidate}
      />
    </div>
  );
}
