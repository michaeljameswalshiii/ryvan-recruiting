"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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

interface CandidateEditModalProps {
  candidate: Candidate;
  onSave: () => void; // Callback to refresh data after save
  children: React.ReactNode;
}

export default function CandidateEditModal({
  candidate,
  onSave,
  children,
}: CandidateEditModalProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - initialize with candidate data
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    location: "",
    linkedin_url: "",
    notes: "",
  });

  // Reset form when modal opens or candidate changes
  useEffect(() => {
    if (open && candidate) {
      setFormData({
        name: candidate.name || "",
        email: candidate.email || "",
        phone: candidate.phone || "",
        title: candidate.title || "",
        linkedin_url: candidate.linkedin_url || "",
        location: candidate.location || "",
        notes: candidate.notes || "",
      });
    }
  }, [open, candidate]);

const handleSave = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);

    try {
      // Send as JSON - the API expects JSON body
      const response = await fetch(`/api/data/leads/${candidate.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          title: formData.title || undefined,
          location: formData.location || undefined,
          linkedin_url: formData.linkedin_url || undefined,
          location: formData.location || undefined,
          notes: formData.notes || undefined,
        }),
      });

      const result = await response.json().catch(() => ({ error: "Invalid response" }));

      if (!response.ok) {
        console.error("Update lead API error:", result);
        throw new Error(result.error || result.message || "Failed to update candidate");
      }

      toast.success(`${formData.name} updated successfully!`);
      onSave(); // Refresh data
      setOpen(false);
    } catch (err: any) {
      console.error("Failed to update candidate:", err);
      // Show the actual error message
      toast.error(err.message || "Failed to update candidate");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form when closing
      setFormData({
        name: candidate.name || "",
        email: candidate.email || "",
        phone: candidate.phone || "",
        title: candidate.title || "",
        linkedin_url: candidate.linkedin_url || "",
        location: candidate.location || "",
        notes: candidate.notes || "",
      });
    }
    setOpen(isOpen);
  };

  return (
    <>
      {/* Wrap the trigger button */}
      {(() => {
        // Render children with onClick to open modal
        return (
          <span onClick={() => setOpen(true)} className="cursor-pointer">
            {children}
          </span>
        );
      })()}

      <SimpleDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Edit Candidate"
        description="Update candidate information. Click save when done."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {/* Full Name */}
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Full Name *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Smith"
            />
          </div>

          {/* Job Title */}
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Job Title</Label>
            <Input
              id="edit-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Senior Software Engineer"
            />
          </div>


          {/* Email and Phone - side by side */}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* LinkedIn URL */}
          <div className="grid gap-2">
            <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
            <Input
              id="edit-linkedin"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              placeholder="https://linkedin.com/in/johnsmith"
            />
          </div>

          {/* Location */}
          <div className="grid gap-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="San Francisco, CA"
            />
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this candidate..."
              rows={4}
            />
          </div>
        </div>
      </SimpleDialog>
    </>
  );
}
