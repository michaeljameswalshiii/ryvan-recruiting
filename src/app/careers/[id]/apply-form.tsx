"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  jobId: string;
  jobTitle: string;
};

export function CareersApplyForm({ jobId, jobTitle }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/public/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          name,
          email,
          phone,
          message,
          resumeUrl,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("err");
        setError(data.error || "Submission failed");
        return;
      }
      setStatus("ok");
    } catch {
      setStatus("err");
      setError("Network error — please try again");
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
        <p className="font-medium text-emerald-900">Application received</p>
        <p className="mt-1 text-sm text-emerald-800">
          Thanks for applying to {jobTitle}. We&apos;ll be in touch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Honeypot — leave empty */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Full name *
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Email *
        </label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Resume URL (optional)
        </label>
        <input
          type="url"
          placeholder="https://..."
          value={resumeUrl}
          onChange={(e) => setResumeUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Message
        </label>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
      </div>

      {status === "err" && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 sm:w-auto"
      >
        {status === "loading" ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
