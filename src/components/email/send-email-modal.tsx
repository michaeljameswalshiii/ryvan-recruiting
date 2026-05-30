"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Mail } from "lucide-react";

export interface CandidateInfo {
  email: string;
  name?: string;
}

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: CandidateInfo | null;
  onSend?: (subject: string, body: string) => Promise<void>;
}

const EMAIL_TEMPLATES = [
  { id: "interview", label: "Interview Invitation", subject: "Interview Invitation - Turnkey Optimization" },
  { id: "update", label: "Application Update", subject: "Update on Your Application" },
  { id: "offer", label: "Job Offer", subject: "Job Offer - Turnkey Optimization" },
  { id: "rejection", label: "Not Moving Forward", subject: "Update on Your Application - Turnkey Optimization" },
  { id: "custom", label: "Custom Message", subject: "" },
];

export function SendEmailModal({ open, onOpenChange, candidate, onSend }: SendEmailModalProps) {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (candidate) {
      setSubject("Interview Invitation - Turnkey Optimization");
      setMessage("");
      setSent(false);
      setError("");
    }
  }, [candidate, open]);

  const handleTemplateSelect = (templateId: string) => {
    const template = EMAIL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      if (templateId === "interview") {
        setMessage(`Dear ${candidate?.name || 'Candidate'},

Thank you for your interest in Turnkey Optimization. We have reviewed your application and would like to invite you for an interview.

Please let us know your availability for the coming week.

Best regards,
Turnkey Optimization Team`);
      } else if (templateId === "offer") {
        setMessage(`Dear ${candidate?.name || 'Candidate'},

Congratulations! We are pleased to offer you a position at Turnkey Optimization.

Please review the attached offer details and let us know if you have any questions.

We're excited to have you join our team!

Best regards,
Turnkey Optimization Team`);
      } else if (templateId === "rejection") {
        setMessage(`Dear ${candidate?.name || 'Candidate'},

Thank you for your interest in Turnkey Optimization.

After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

We wish you the best in your job search.

Best regards,
Turnkey Optimization Team`);
      } else if (templateId === "update") {
        setMessage(`Dear ${candidate?.name || 'Candidate'},

Thank you for your interest in Turnkey Optimization.

We wanted to provide you with an update on your application status.

Please let us know if you have any questions.

Best regards,
Turnkey Optimization Team`);
      }
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
      const response = await fetch("/api/email-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: candidate.email,
          name: candidate.name,
          subject,
          text: message,
        }),
      });

const data = await response.json();

      if (data.success) {
        // Call the onSend callback if provided (for event recording)
        if (onSend) {
          try {
            await onSend(subject, message);
          } catch (callbackErr) {
            console.error('Error in onSend callback:', callbackErr);
          }
        }
        
        setSent(true);
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setError(data.error || "Failed to send email");
      }
    } catch (err) {
      setError("Failed to send email. Please try again.");
    } finally {
      setSending(false);
    }
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
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-600">Email Sent!</h3>
              <p className="text-muted-foreground mt-2">
                Your email has been sent to {candidate.name || candidate.email}
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
              </div>

              <div className="space-y-2">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-2">
                  {EMAIL_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors"
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
                <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSend} disabled={sending || !subject || !message}>
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
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
