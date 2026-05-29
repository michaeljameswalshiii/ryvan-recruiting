"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { toast } from "sonner";
import { ArrowLeft, Mail, Trash2, Save, Loader2 } from "lucide-react";

interface CandidateData {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  linkedin: string;
  status: string;
  source: string;
  resumeUrl: string;
  notes: string;
  createdAt: string;
}

const pipelineStages = [
  { id: "identification", label: "Identification" },
  { id: "outreach", label: "Attempted Outreach" },
  { id: "conversation", label: "Conversation" },
  { id: "presented", label: "Candidate Presented" },
  { id: "interview", label: "Interview" },
  { id: "accept", label: "Accept" },
  { id: "rejected", label: "Rejected" },
];

interface Props {
  params: Promise<{ id: string }>;
}

export default function CandidateDetailPage({ params }: Props) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formData, setFormData] = useState<CandidateData>({
    id: "",
    name: "",
    email: "",
    phone: "",
    title: "",
    company: "",
    linkedin: "",
    status: "identification",
    source: "",
    resumeUrl: "",
    notes: "",
    createdAt: "",
  });

  const loadCandidate = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/data/leads/${id}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load candidate");
      }

      const result = await response.json();
      const data = result.lead;

      if (data) {
        setFormData({
          id: data.id || "",
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          title: data.title || "",
          company: data.location || "",
          linkedin: data.linkedin_url || "",
          status: data.status || "identification",
          source: data.source || "",
          resumeUrl: data.resume_url || "",
          notes: data.notes || "",
          createdAt: data.created_at || "",
        });
      }
    } catch (err: any) {
      console.error("Failed to load candidate:", err);
      toast.error(err.message || "Failed to load candidate");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    params.then(({ id }) => {
      setCandidateId(id);
      loadCandidate(id);
    });
  }, [params, loadCandidate]);

  const avatarInitials = formData.name
    ? formData.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "";

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/data/leads/${candidateId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          title: formData.title || undefined,
          location: formData.company || undefined,
          linkedin_url: formData.linkedin || undefined,
          status: formData.status,
          resume_url: formData.resumeUrl || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save candidate");
      }

      toast.success("Candidate saved successfully!");
    } catch (err: any) {
      console.error("Failed to save candidate:", err);
      toast.error(err.message || "Failed to save candidate");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/data/leads/${candidateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete candidate");
      }

      toast.success("Candidate deleted successfully!");
router.push("/candidates");
    } catch (err: any) {
      console.error("Failed to delete candidate:", err);
      toast.error(err.message || "Failed to delete candidate");
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
<Link href="/candidates">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white shadow">
              {avatarInitials || "?"}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="text-3xl font-semibold tracking-tight bg-transparent border-none outline-none w-full placeholder:text-gray-400"
                placeholder="Enter candidate name..."
              />
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="text-sm text-gray-600 bg-transparent border-none outline-none w-full placeholder:text-gray-400"
                placeholder="Enter job title..."
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button asChild>
              <a href={`mailto:${formData.email}`}>
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Candidate Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Company Name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="linkedin">LinkedIn</Label>
                <Input
                  id="linkedin"
                  value={formData.linkedin}
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pipelineStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="Source"
                  disabled
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {formData.resumeUrl && (
          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[600px]">
                <ResumeViewer url={formData.resumeUrl} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add notes about this candidate..."
              rows={6}
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 right-0 left-0 md:left-64 bg-white border-t p-4 z-10">
        <div className="max-w-4xl mx-auto flex justify-end gap-3">
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Candidate
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <SimpleDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Candidate"
        description={`Are you sure you want to delete ${formData.name}? This action cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This will permanently remove the candidate from your database.
        </p>
      </SimpleDialog>
    </div>
  );
}
