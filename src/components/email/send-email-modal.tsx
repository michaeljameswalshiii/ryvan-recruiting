"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Mail, ExternalLink } from "lucide-react";

export interface CandidateInfo {
  email: string;
  name?: string;
}

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: CandidateInfo | null;
  /**
   * Preferred path: parent sends via connected Gmail/Outlook.
   * If omitted, modal POSTs /api/email/send (session-based).
   */
  onSend?: (subject: string, body: string) => Promise<void>;
  /** Shown under the form (e.g. "Sending as you@company.com via Gmail") */
  fromLabel?: string;
}

const EMAIL_TEMPLATES = [
  {
    id: "interview",
    label: "Interview Invitation",
    subject: "Interview Invitation - Trio Recruiting",
  },
  {
    id: "update",
    label: "Application Update",
    subject: "Update on Your Application",
  },
  {
    id: "offer",
    label: "Job Offer",
    subject: "Job Offer - Trio Recruiting",
  },
  {
    id: "rejection",
    label: "Not Moving Forward",
    subject: "Update on Your Application - Trio Recruiting",
  },
  { id: "custom", label: "Custom Message", subject: "" },
];

export function openGmailCompose(to: string, subject?: string, body?: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  const url = `https://mail.google.com/mail/?${params.toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function SendEmailModal({
  open,
  onOpenChange,
  candidate,
  onSend,
  fromLabel,
}: SendEmailModalProps) {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (candidate && open) {
      setSubject("Interview Invitation - Trio Recruiting");
      setMessage("");
      setSent(false);
      setError("");
    }
  }, [candidate, open]);

  const handleTemplateSelect = (templateId: string) => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setSubject(template.subject);
    const first = candidate?.name || "Candidate";
    if (templateId === "interview") {
      setMessage(
        `Dear ${first},\n\nThank you for your interest. We have reviewed your application and would like to invite you for an interview.\n\nPlease let us know your availability for the coming week.\n\nBest regards`
      );
    } else if (templateId === "offer") {
      setMessage(
        `Dear ${first},\n\nCongratulations! We are pleased to offer you a position.\n\nPlease review the offer details and let us know if you have any questions.\n\nBest regards`
      );
    } else if (templateId === "rejection") {
      setMessage(
        `Dear ${first},\n\nThank you for your interest.\n\nAfter careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe wish you the best in your job search.\n\nBest regards`
      );
    } else if (templateId === "update") {
      setMessage(
        `Dear ${first},\n\nThank you for your interest.\n\nWe wanted to provide you with an update on your application status.\n\nPlease let us know if you have any questions.\n\nBest regards`
      );
    }
  };

  const handleSend = async () => {
    if (!candidate || !subject || !message) {
      setError("Please fill in subject and message");
      return;
    }

    setSending(true);
    setError("");

    try {
      if (onSend) {
        await onSend(subject, message);
      } else {
        const response = await fetch("/api/email/send", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: candidate.email,
            subject,
            text: message,
            html: message.replace(/\n/g, "<br/>"),
            candidateEmail: candidate.email,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
          throw new Error(data.error || "Failed to send email");
        }
      }

      setSent(true);
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send email. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const openInGmail = () => {
    if (!candidate?.email) return;
    openGmailCompose(candidate.email, subject || undefined, message || undefined);
  };

  if (!candidate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Email to Candidate</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {sent ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-600">
                Email Sent!
              </h3>
              <p className="mt-2 text-muted-foreground">
                Your email has been sent to{" "}
                {candidate.name || candidate.email}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  value={`${candidate.name || ""} <${candidate.email}>`.trim()}
                  disabled
                  className="bg-muted"
                />
                {fromLabel && (
                  <p className="text-xs text-muted-foreground">{fromLabel}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-2">
                  {EMAIL_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplateSelect(template.id)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="min-h-[200px] resize-none"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                  <button
                    type="button"
                    onClick={openInGmail}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Gmail instead
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={openInGmail}
                  className="mr-auto"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Gmail
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || !subject || !message}
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
