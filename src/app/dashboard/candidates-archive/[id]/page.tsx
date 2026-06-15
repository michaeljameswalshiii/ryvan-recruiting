"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Linkedin, Calendar, Briefcase, FileText, Loader2, Trash2, Send, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeads, useUpdateLead, useDeleteLead } from "@/lib/hooks/query-lead";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Format date for display
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
}

// Get time ago string
function getTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  } catch {
    return "N/A";
  }
}

export default function CandidateDetailPage() {
  const params = useParams();
  const candidateId = params.id as string;
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    location: "",
    linkedin_url: "",
    notes: "",
  });

  // Fetch the lead data
  const { data: leads = [], isLoading } = useLeads();
  const updateLeadMutation = useUpdateLead();
  const deleteLeadMutation = useDeleteLead();

  // Find the specific lead
  const lead = leads.find((l: any) => l.id === candidateId);

  useEffect(() => {
    if (lead) {
      setFormData({
        name: lead.name || "",
        email: lead.email || "",
        phone: lead.phone || "",
        title: lead.title || "",
        location: lead.location || "",
        linkedin_url: lead.linkedin_url || "",
        notes: lead.notes || "",
      });
    }
  }, [lead]);

  const handleSave = async () => {
    try {
      const formDataToSend = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        formDataToSend.set(key, value);
      });

      await updateLeadMutation.mutateAsync({ leadId: candidateId, formData: formDataToSend });
      
      toast.success("Candidate updated successfully");
      setIsEditing(false);
    } catch (err: any) {
      console.error("Failed to update candidate:", err);
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this candidate?")) return;
    
    try {
      await deleteLeadMutation.mutateAsync(candidateId);
      
      toast.success("Candidate deleted successfully");
      // Redirect to candidates list
      window.location.href = "/dashboard/candidates";
    } catch (err: any) {
      console.error("Failed to delete candidate:", err);
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading candidate...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Candidate not found</p>
          <Link href="/dashboard/candidates">
            <Button className="mt-4">Back to Candidates</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/candidates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            <p className="text-muted-foreground">{lead.title || "No title"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            <Edit className="h-4 w-4 mr-2" />
            {isEditing ? "Cancel" : "Edit"}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteLeadMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex gap-2">
        <Badge variant={lead.status === "accepted" ? "default" : "secondary"}>
          {lead.status || "New"}
        </Badge>
        <Badge variant="outline">{lead.source || "Direct"}</Badge>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  />
                </div>
                <Button onClick={handleSave} disabled={updateLeadMutation.isPending}>
                  {updateLeadMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.email || "N/A"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.phone || "N/A"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.location || "N/A"}</span>
                </div>
                {lead.linkedin_url && (
                  <div className="flex items-center gap-3">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professional Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Professional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{lead.title || "N/A"}</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{lead.location || "N/A"}</span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Added {formatDate(lead.created_at)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Last activity {getTimeAgo(lead.modified_at || lead.created_at)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{lead.notes || "No notes"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
