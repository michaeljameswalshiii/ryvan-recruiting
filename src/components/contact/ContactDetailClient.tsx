"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Edit2, ExternalLink, Linkedin, MapPin, Building2, Star, User, Briefcase, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { toast } from "sonner";

interface ContactData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  // Company info
  companyId: string;
  companyName: string;
  // Additional fields
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
  const [isLoading, setIsLoading] = useState(false);

  // Handle send email with event recording
  const handleSendEmail = async (subject: string, body: string) => {
    try {
      // Log the activity to the company's activity timeline
      const response = await fetch(`/api/company/${contact.companyId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'EMAIL_SENT',
          title: 'Email Sent',
          description: `Email sent to ${contact.name} (${contact.email}) - Subject: ${subject}`,
          metadata: {
            subject,
            body,
            contactId: contact.id,
            contactEmail: contact.email,
          }
        })
      });
      
      if (!response.ok) {
        console.error('Failed to log email event');
      }
      
      toast.success(`Email sent to ${contact.email}`);
    } catch (err) {
      console.error('Error logging email event:', err);
      toast.success(`Email sent to ${contact.email}`);
    }
  };

  // Handle call action - opens phone dialer
  const handleCall = () => {
    if (contact.phone) {
      window.location.href = `tel:${contact.phone}`;
    } else {
      toast.error("No phone number available");
    }
  };

  // Generate avatar initials
  const avatarInitials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/contacts">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white shadow">
                {avatarInitials}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight">{contact.name}</h1>
                  {contact.isPrimary && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      <Star className="h-3 w-3 mr-1" />
                      Primary
                    </Badge>
                  )}
                </div>
                {contact.title && (
                  <p className="text-muted-foreground">{contact.title}</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleCall}
              disabled={!contact.phone}
            >
              <Phone className="h-4 w-4" />
              Call
            </Button>
            <Button 
              className="flex items-center gap-2"
              onClick={() => setShowEmailModal(true)}
            >
              <Mail className="h-4 w-4" />
              Send Email
            </Button>
            <Button 
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => router.push(`/dashboard/contacts/${contact.id}/edit?companyId=${contact.companyId}`)}
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full p-6 space-y-6">
        {/* Basic Info Row */}
        <div className="flex flex-wrap gap-6 bg-card border rounded-lg p-4">
          {contact.email && (
            <a 
              href={`mailto:${contact.email}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              <span>{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a 
              href={`tel:${contact.phone}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Phone className="h-4 w-4" />
              <span>{contact.phone}</span>
            </a>
          )}
          {contact.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{contact.location}</span>
            </div>
          )}
          {contact.linkedin && (
            <a 
              href={contact.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Linkedin className="h-4 w-4" />
              <span>LinkedIn Profile</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Contact Details + Activity (60%) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Contact Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contact Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {/* Name */}
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{contact.name}</span>
                  </div>
                  {/* Title */}
                  <div>
                    <span className="text-muted-foreground">Title:</span>{" "}
                    <span className="font-medium">{contact.title || "—"}</span>
                  </div>
                  {/* Email */}
                  <div>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                        {contact.email}
                      </a>
                    ) : "—"}
                  </div>
                  {/* Phone */}
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                        {contact.phone}
                      </a>
                    ) : "—"}
                  </div>
                  {/* Location */}
                  <div>
                    <span className="text-muted-foreground">Location:</span>{" "}
                    <span>{contact.location || "—"}</span>
                  </div>
                  {/* LinkedIn */}
                  <div>
                    <span className="text-muted-foreground">LinkedIn:</span>{" "}
                    {contact.linkedin ? (
                      <a 
                        href={contact.linkedin} 
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        View Profile
                      </a>
                    ) : "—"}
                  </div>
                  {/* Source */}
                  <div>
                    <span className="text-muted-foreground">Source:</span>{" "}
                    <span>{contact.source || "—"}</span>
                  </div>
                  {/* Primary Contact */}
                  <div>
                    <span className="text-muted-foreground">Primary Contact:</span>{" "}
                    <Badge variant={contact.isPrimary ? "default" : "outline"}>
                      {contact.isPrimary ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {/* Created */}
                  {contact.createdAt && (
                    <div>
                      <span className="text-muted-foreground">Created:</span>{" "}
                      <span>{new Date(contact.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {contact.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {contact.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity & Notes Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Activity & Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activity yet</p>
                  <p className="text-sm mt-1">Activity will appear here</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Company Info + Quick Stats (40%) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Company Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Company Name */}
                <div>
                  <Link 
                    href={`/dashboard/companies/${contact.companyId}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {contact.companyName}
                  </Link>
                </div>

                {/* Quick Stats (placeholder for now - can add job count, etc.) */}
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Quick Stats</p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Open Jobs</span>
                      <Badge variant="outline">0</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Candidates</span>
                      <Badge variant="outline">0</Badge>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="pt-4 border-t">
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" asChild className="w-full justify-start">
                      <Link href={`/dashboard/companies/${contact.companyId}`}>
                        <Building2 className="h-4 w-4 mr-2" />
                        View Company
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Send Email Modal */}
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
