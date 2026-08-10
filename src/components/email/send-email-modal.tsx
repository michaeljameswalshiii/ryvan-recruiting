"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Mail, ExternalLink, X } from "lucide-react";

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
  /** When false, disable in-app Send and push user to Gmail web */
  allowInAppSend?: boolean;
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

/** Build Gmail web compose URL for a recipient (and optional subject/body). */
export function buildGmailComposeUrl(
  to: string,
  subject?: string,
  body?: string
): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Open Gmail web compose in a new tab.
 * Prefer a real <a target="_blank"> when possible — more reliable than window.open.
 */
export function openGmailCompose(
  to: string,
  subject?: string,
  body?: string
): boolean {
  const url = buildGmailComposeUrl(to, subject, body);
  const win = window.open(url, "_blank");
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    return true;
  }
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

export function SendEmailModal({
  open,
  onOpenChange,
  candidate,
  onSend,
  fromLabel,
  allowInAppSend = true,
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

  // Escape to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const gmailHref = candidate?.email
    ? buildGmailComposeUrl(
        candidate.email,
        subject || undefined,
        message || undefined
      )
    : "#";

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
    if (!allowInAppSend) {
      setError(
        "No email account connected. Use Open in Gmail, or connect Gmail/Outlook in Settings."
      );
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
        err instanceof Error
          ? err.message
          : "Failed to send email. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  if (!open || !candidate) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-email-title"
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white text-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-slate-50 px-6 py-4">
          <h2 id="send-email-title" className="text-lg font-semibold">
            Send Email to Candidate
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
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
                <Label htmlFor="send-email-to">To</Label>
                <Input
                  id="send-email-to"
                  value={`${candidate.name || ""} <${candidate.email}>`.trim()}
                  disabled
                  className="bg-slate-50"
                />
                {fromLabel ? (
                  <p className="text-xs text-slate-500">{fromLabel}</p>
                ) : (
                  <p className="text-xs text-slate-500">
                    No in-app email connected — use{" "}
                    <strong>Open in Gmail</strong>, or connect Gmail/Outlook in
                    Settings.
                  </p>
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
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs transition-colors hover:bg-slate-100"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="send-email-subject">Subject</Label>
                <Input
                  id="send-email-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject..."
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="send-email-message">Message</Label>
                <Textarea
                  id="send-email-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="min-h-[180px] resize-none bg-white"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                  <a
                    href={gmailHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Gmail instead
                  </a>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <a
                  href={gmailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mr-auto inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Gmail
                </a>
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
                  disabled={
                    !allowInAppSend || sending || !subject || !message
                  }
                  title={
                    allowInAppSend
                      ? "Send via connected Gmail/Outlook"
                      : "Connect Gmail or Outlook in Settings to send in-app"
                  }
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
      </div>
    </div>
  );
}
