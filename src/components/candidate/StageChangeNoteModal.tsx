"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, StickyNote, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Stage Change Note Modal
 * 
 * Automatically shown when user changes a candidate's stage in a job.
 * Prompts user to add a note about the stage change.
 * 
 * Per task requirement #4:
 * "Whenever a user changes the stage on a Candidate + Job:
 * Immediately show a modal/prompt: 'You changed the stage to [New Stage]. Would you like to add a note about this?'
 * User must be able to skip the note."
 */

interface StageChangeNoteModalProps {
  isOpen: boolean;
  newStage: string;
  newStageLabel?: string;
  jobTitle: string;
  candidateName: string;
  onSaveNote: (note: string) => Promise<void>;
  onSkip: () => void;
}

// Get display label for stage
function getStageDisplayLabel(stage: string): string {
  const stageLabels: Record<string, string> = {
    sourced: "Sourced",
    left_message: "Left Message",
    text: "Text",
    email: "Email",
    other: "Other",
    contacted: "Contacted",
    pre_screened: "Pre-Screened",
    submitted: "Submitted",
    interviewing: "Interviewing",
    offer_out: "Offer Out",
    offer_accepted: "Offer Accepted",
    offer_declined: "Offer Declined",
    placed: "Placed",
    rejected: "Rejected",
    not_interested: "Not Interested",
  };
  return stageLabels[stage] || stage;
}

// Get color for stage badge
function getStageColor(stage: string): string {
  const stageColors: Record<string, string> = {
    sourced: "bg-gray-100 text-gray-800",
    left_message: "bg-blue-100 text-blue-800",
    text: "bg-blue-100 text-blue-800",
    email: "bg-blue-100 text-blue-800",
    other: "bg-gray-100 text-gray-800",
    contacted: "bg-blue-100 text-blue-800",
    pre_screened: "bg-violet-100 text-violet-800",
    submitted: "bg-violet-100 text-violet-800",
    interviewing: "bg-amber-100 text-amber-800",
    offer_out: "bg-amber-100 text-amber-800",
    offer_accepted: "bg-green-100 text-green-800",
    offer_declined: "bg-red-100 text-red-800",
    placed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    not_interested: "bg-gray-100 text-gray-800",
  };
  return stageColors[stage] || "bg-gray-100 text-gray-800";
}

export function StageChangeNoteModal({
  isOpen,
  newStage,
  newStageLabel,
  jobTitle,
  candidateName,
  onSaveNote,
  onSkip,
}: StageChangeNoteModalProps) {
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Reset note when modal opens with new stage
  useEffect(() => {
    if (isOpen) {
      setNote("");
    }
  }, [isOpen, newStage]);

  const handleSave = async () => {
    if (!note.trim()) {
      // Don't save empty notes, just skip
      onSkip();
      return;
    }

    setIsSaving(true);
    try {
      await onSaveNote(note);
      toast.success("Note added successfully");
    } catch (err: any) {
      console.error("[StageChangeNoteModal] Error saving note:", err);
      toast.error(err.message || "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setNote("");
    onSkip();
  };

  if (!isOpen) return null;

  const displayLabel = newStageLabel || getStageDisplayLabel(newStage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <StickyNote className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Stage Changed</h2>
              <p className="text-sm text-muted-foreground">
                for {candidateName}
              </p>
            </div>
          </div>
        </div>

        {/* Stage Info */}
        <div className="bg-background rounded-lg p-4 mb-4 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Job</p>
              <p className="font-medium text-sm text-foreground">{jobTitle}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">New Stage</p>
              <Badge className={getStageColor(newStage)}>
                {displayLabel}
              </Badge>
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div className="mb-4">
          <p className="text-sm text-foreground">
            You changed the stage to <span className="font-medium">{displayLabel}</span>.
            Would you like to add a note about this?
          </p>
        </div>

        {/* Note Textarea */}
        <div className="mb-6">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Note (optional)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this stage change..."
            rows={3}
            className="resize-none"
            disabled={isSaving}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Skip
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <StickyNote className="w-4 h-4" />
                Save Note
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
