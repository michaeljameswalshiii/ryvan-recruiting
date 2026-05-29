"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EventTimeline from "@/components/EventTimeline";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { ArrowLeft, Mail, Edit, User, FileText } from "lucide-react";

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
  status: string;
  source?: string;
  createdAt: string;
  avatarInitials?: string;
}

interface CandidateDetailClientProps {
  candidate: Candidate;
}

type Tab = "overview" | "timeline" | "resume" | "notes" | "emails" | "details";

export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

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
    ...(candidate.resumeUrl ? [{ id: "resume" as Tab, label: "Resume" }] : []),
    { id: "notes", label: "Notes" },
    { id: "emails", label: "Emails" },
    { id: "details", label: "Details" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
<a href="/candidates">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white shadow">
                {avatarInitials}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{candidate.name}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>{candidate.title}</span>
                  <span className="text-gray-400">•</span>
                  <span>{candidate.company}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button className="flex items-center gap-2" asChild>
              <a href={`mailto:${candidate.email}`}>
                <Mail className="h-4 w-4" /> Send Email
              </a>
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6">
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

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-xl border">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" /> Contact Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Email:</strong>{" "}
                    <a
                      href={`mailto:${candidate.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {candidate.email}
                    </a>
                  </div>
                  {candidate.phone && (
                    <div>
                      <strong>Phone:</strong> {candidate.phone}
                    </div>
                  )}
                  {candidate.linkedin && (
                    <div>
                      <strong>LinkedIn:</strong>{" "}
                      <a
                        href={candidate.linkedin}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        View Profile
                      </a>
                    </div>
                  )}
                  {candidate.resumeUrl && (
                    <div>
                      <strong>Resume:</strong>{" "}
                      <button
                        onClick={() => setActiveTab("resume")}
                        className="text-blue-600 hover:underline"
                      >
                        View Resume
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="bg-white p-6 rounded-xl border">
                <Badge variant="secondary" className="mb-4 capitalize">
                  {candidate.status}
                </Badge>
                <div className="text-sm space-y-2">
                  <div>
                    <strong>Source:</strong> {candidate.source}
                  </div>
                  <div>
                    <strong>Added:</strong>{" "}
                    {new Date(candidate.createdAt).toLocaleDateString()}
                  </div>
                </div>
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
        {activeTab === "resume" && candidate.resumeUrl && (
          <div className="bg-white rounded-xl border overflow-hidden h-[720px] flex flex-col">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" /> Resume
              </h2>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Full Screen
                </a>
              </Button>
            </div>
            <ResumeViewer
              url={candidate.resumeUrl}
              fileName={`${candidate.name.replace(/ /g, "-")}-resume.pdf`}
            />
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === "notes" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Notes</h2>
            <p className="text-gray-500">
              Notes tab coming soon (integrated with timeline).
            </p>
          </div>
        )}

        {/* Emails Tab */}
        {activeTab === "emails" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Email History</h2>
            <p className="text-gray-500">Email history coming soon.</p>
          </div>
        )}

        {/* Details Tab */}
        {activeTab === "details" && (
          <div className="bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Full Details</h2>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(candidate, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
