"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Edit2,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { useJobsForCompany } from "@/lib/hooks/query-job";
import { useLeads } from "@/lib/hooks/query-lead";

const noteTypes = [
  { value: "general", label: "General Note" },
  { value: "phone_call", label: "Phone Call" },
  { value: "email_sent", label: "Email Sent" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "check_in", label: "Check-In" },
  { value: "other", label: "Other" },
];

interface ActivityEvent {
  id: string;
  eventType: string;
  title: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
}

interface ContactPhone {
  id: string;
  number: string;
  type: string;
  isPreferred?: boolean;
}

interface ContactData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  phones?: ContactPhone[];
  title?: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  companyId: string;
  companyName: string;
  linkedin?: string;
  location?: string;
  source?: string;
}

interface ContactDetailClientProps {
  contact: ContactData;
}

export function ContactDetailClient({ contact }: ContactDetailClientProps) {
  const router = useRouter();
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [addingNote, setAddingNote] = useState(false);

  const { data: companyJobs = [], isLoading: jobsLoading } = useJobsForCompany(contact.companyId);
  const { data: allLeads = [], isLoading: leadsLoading } = useLeads();

  const companyCandidates = useMemo(
    () =>
      allLeads.filter(
        (lead: any) => lead.company?.toLowerCase() === contact.companyName?.toLowerCase(),
      ),
    [allLeads, contact.companyName],
  );

  const openJobs = useMemo(
    () => companyJobs.filter((job: any) => (job.status || "").toLowerCase() === "open"),
    [companyJobs],
  );
  const openJobsCount = openJobs.length;
  const candidatesCount = companyCandidates.length;

  useEffect(() => {
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.companyId, contact.id]);

  async function fetchActivities() {
    try {
      setActivitiesLoading(true);
      const response = await fetch(`/api/company/${contact.companyId}/events?limit=20`);
      if (!response.ok) {
        throw new Error("Failed to fetch activities");
      }

      const data = await response.json();
      const contactEvents = (data.events || []).filter(
        (event: any) =>
          event.metadata?.contactId === contact.id ||
          (contact.email && event.description?.includes(contact.email)),
      );

      const sorted = contactEvents.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setActivities(sorted);
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setActivitiesLoading(false);
    }
  }

  async function handleAddNote() {
    if (!newNoteText.trim()) {
      return;
    }

    try {
      setAddingNote(true);

      const response = await fetch(`/api/company/${contact.companyId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "NOTE",
          title: noteTypes.find((n) => n.value === newNoteType)?.label || "Note",
          description: newNoteText.trim(),
          metadata: {
            noteType: newNoteType,
            contactId: contact.id,
            contactEmail: contact.email,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add note");
      }

      setNewNoteText("");
      setNewNoteType("general");
      toast.success("Activity logged");
      await fetchActivities();
    } catch (error) {
      console.error("Failed to add note:", error);
      toast.error("Failed to log activity");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleSendEmail(subject: string, body: string) {
    try {
      const response = await fetch(`/api/company/${contact.companyId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "EMAIL_SENT",
          title: "Email Sent",
          description: `Email sent to ${contact.name} (${contact.email}) - Subject: ${subject}`,
          metadata: {
            subject,
            body,
            contactId: contact.id,
            contactEmail: contact.email,
          },
        }),
      });

      if (!response.ok) {
        console.error("Failed to log email event");
      }

      toast.success(`Email sent to ${contact.email}`);
    } catch (error) {
      console.error("Error logging email event:", error);
      toast.success(`Email sent to ${contact.email}`);
    }
  }

  function handleCall() {
    const preferredPhone = contact.phone || contact.phones?.find((p) => p.isPreferred)?.number;
    if (preferredPhone) {
      window.location.href = `tel:${preferredPhone}`;
      return;
    }
    toast.error("No phone number available");
  }

  function getEventStyle(eventType: string) {
    const styles: Record<string, { badge: string; dot: string }> = {
      EMAIL_SENT: {
        badge: "bg-blue-100 text-blue-800 border-blue-200",
        dot: "bg-blue-500",
      },
      NOTE: {
        badge: "bg-amber-100 text-amber-800 border-amber-200",
        dot: "bg-amber-500",
      },
      phone_call: {
        badge: "bg-green-100 text-green-800 border-green-200",
        dot: "bg-green-500",
      },
      meeting: {
        badge: "bg-purple-100 text-purple-800 border-purple-200",
        dot: "bg-purple-500",
      },
      follow_up: {
        badge: "bg-orange-100 text-orange-800 border-orange-200",
        dot: "bg-orange-500",
      },
      check_in: {
        badge: "bg-cyan-100 text-cyan-800 border-cyan-200",
        dot: "bg-cyan-500",
      },
    };

    return styles[eventType] || styles.NOTE;
  }

  const initials = contact.name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b bg-card">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/dashboard/contacts" className="mt-1">
                <Button variant="ghost" size="icon" aria-label="Back to contacts">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>

              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-xl font-bold text-white shadow-sm">
                  {initials || "NA"}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{contact.name}</h1>
                    {contact.isPrimary && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        <Star className="mr-1 h-3 w-3" />
                        Primary
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{contact.title || "No title"}</span>
                    <span>•</span>
                    <Badge variant="outline" className="font-normal">
                      <Building2 className="mr-1 h-3.5 w-3.5" />
                      {contact.companyName}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" onClick={handleCall}>
                <Phone className="mr-2 h-4 w-4" />
                Call
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/dashboard/contacts/${contact.id}/edit?companyId=${contact.companyId}`)
                }
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button onClick={() => setShowEmailModal(true)}>
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold tracking-[0.12em] text-muted-foreground">
                ACTIVITY &amp; NOTES
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-col gap-2 md:flex-row">
                  <div className="md:w-[220px]">
                    <Select value={newNoteType} onValueChange={setNewNoteType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {noteTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Input
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add note or activity details..."
                    className="md:flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddNote();
                      }
                    }}
                  />

                  <Button onClick={handleAddNote} disabled={addingNote || !newNoteText.trim()}>
                    {addingNote ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging...
                      </>
                    ) : (
                      "Log"
                    )}
                  </Button>
                </div>
              </div>

              {activitiesLoading ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin" />
                  <p className="mt-2 text-sm">Loading activity timeline...</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                  <Calendar className="mx-auto mb-3 h-10 w-10 opacity-50" />
                  <p className="font-medium">No activity yet</p>
                  <p className="text-sm">Use the log form above to add the first note.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const style = getEventStyle(activity.eventType);
                    return (
                      <div key={activity.id} className="flex gap-3">
                        <div className="pt-1">
                          <div className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                        </div>
                        <div className="flex-1 rounded-md border p-3">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${style.badge}`}
                            >
                              {activity.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(activity.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{activity.description || "No details provided."}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Open Jobs</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/jobs/new?companyId=${contact.companyId}`)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Job
              </Button>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <p className="text-sm text-muted-foreground">Loading jobs...</p>
              ) : openJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open jobs for this company.</p>
              ) : (
                <div className="space-y-2">
                  {openJobs.slice(0, 5).map((job: any) => (
                    <Link
                      key={job.id}
                      href={`/dashboard/jobs/${job.id}`}
                      className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted/40"
                    >
                      <span className="truncate pr-2 font-medium">{job.title || "Untitled Job"}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Open Jobs</p>
                <p className="text-xl font-semibold">{jobsLoading ? "..." : openJobsCount}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Candidates</p>
                <p className="text-xl font-semibold">{leadsLoading ? "..." : candidatesCount}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Contacted</p>
                <p className="text-xl font-semibold">{activities.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Primary</p>
                <p className="text-xl font-semibold">{contact.isPrimary ? "Yes" : "No"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Client Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start bg-blue-600 text-white hover:bg-blue-700">
                <Sparkles className="mr-2 h-4 w-4" />
                Draft Outreach / Follow-Up
              </Button>
              <Button className="w-full justify-start bg-purple-600 text-white hover:bg-purple-700">
                <Sparkles className="mr-2 h-4 w-4" />
                Research This Contact
              </Button>
              <Button className="w-full justify-start bg-green-600 text-white hover:bg-green-700">
                <Sparkles className="mr-2 h-4 w-4" />
                Find Similar Contacts
              </Button>
              <Button className="w-full justify-start bg-lime-500 text-black hover:bg-lime-600">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Client Summary
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" asChild className="w-full justify-start">
                <Link href={`/dashboard/companies/${contact.companyId}`}>
                  <Building2 className="mr-2 h-4 w-4" />
                  View Company
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full justify-start">
                <Link href={`/dashboard/contacts/${contact.id}/edit?companyId=${contact.companyId}`}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit Contact
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full justify-start">
                <Link href={`/dashboard/jobs?companyId=${contact.companyId}`}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  View Company Jobs
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </main>

      <SendEmailModal
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        candidate={{
          email: contact.email,
          name: contact.name,
        }}
        onSend={handleSendEmail}
      />
    </div>
  );
}
