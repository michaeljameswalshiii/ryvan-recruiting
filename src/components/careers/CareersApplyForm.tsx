"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type CareersPreScreenQuestion = {
  id: string;
  prompt: string;
  type?: "text" | "yes_no" | "number" | "choice";
  options?: string[];
  required?: boolean;
};

type Props = {
  jobId: string;
  jobTitle: string;
  tenantSlug: string;
  preScreenQuestions?: CareersPreScreenQuestion[];
};

const MAX_MB = 10;
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function CareersApplyForm({
  jobId,
  jobTitle,
  tenantSlug,
  preScreenQuestions,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [message, setMessage] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  const [screenAnswers, setScreenAnswers] = useState<Record<string, string>>(
    {}
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const questions = Array.isArray(preScreenQuestions)
    ? preScreenQuestions.filter((q) => q?.id && q?.prompt)
    : [];

  function onPickFile(file: File | null) {
    setError("");
    if (!file) {
      setResumeFile(null);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Resume must be under ${MAX_MB}MB`);
      setResumeFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const lower = file.name.toLowerCase();
    if (
      !lower.endsWith(".pdf") &&
      !lower.endsWith(".docx") &&
      !lower.endsWith(".doc")
    ) {
      setError("Please upload a PDF or Word (.docx) resume");
      setResumeFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setResumeFile(file);
  }

  function setAnswer(id: string, value: string) {
    setScreenAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!resumeFile) {
      setStatus("err");
      setError("Please attach your resume (PDF or Word) to apply");
      return;
    }
    for (const q of questions) {
      if (q.required === false) continue;
      if (!String(screenAnswers[q.id] || "").trim()) {
        setStatus("err");
        setError(`Please answer: ${q.prompt}`);
        return;
      }
    }
    setStatus("loading");
    try {
      const form = new FormData();
      form.set("jobId", jobId);
      form.set("tenant", tenantSlug);
      form.set("name", name);
      form.set("email", email);
      form.set("phone", phone);
      form.set("message", message);
      form.set("linkedinUrl", linkedinUrl);
      form.set("website", website);
      form.set("resume", resumeFile);
      if (questions.length > 0) {
        form.set("screenAnswers", JSON.stringify(screenAnswers));
      }

      const res = await fetch("/api/public/careers/apply", {
        method: "POST",
        body: form,
        // Do not set Content-Type — browser sets multipart boundary
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

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5";

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
          className={inputClass}
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
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          LinkedIn profile{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.linkedin.com/in/yourname"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Resume *{" "}
          <span className="font-normal text-slate-500">
            (PDF or Word, max {MAX_MB}MB)
          </span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="career-resume"
            type="file"
            required
            accept={ACCEPT}
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            className="sr-only"
            aria-required="true"
          />
          <label
            htmlFor="career-resume"
            className="inline-flex cursor-pointer items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-800 focus-within:ring-2 focus-within:ring-slate-400 focus-within:ring-offset-2"
            style={{ color: "#ffffff" }}
          >
            Choose File
          </label>
          {!resumeFile && (
            <span className="text-sm text-slate-600">No file chosen</span>
          )}
        </div>
        {resumeFile ? (
          <p className="mt-1.5 text-xs text-slate-500">
            Selected:{" "}
            <span className="font-medium text-slate-700">{resumeFile.name}</span>{" "}
            ({(resumeFile.size / 1024).toFixed(0)} KB)
            <button
              type="button"
              className="ml-2 text-slate-500 underline hover:text-slate-800"
              onClick={() => {
                setResumeFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Remove
            </button>
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            Required — upload a PDF or Word file to apply.
          </p>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Screening questions
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Please answer the questions below before submitting.
            </p>
          </div>
          {questions.map((q) => {
            const required = q.required !== false;
            const type = q.type || "text";
            const label = (
              <label className="block text-sm font-medium text-slate-700">
                {q.prompt}
                {required ? " *" : ""}
              </label>
            );
            if (type === "yes_no") {
              return (
                <div key={q.id}>
                  {label}
                  <select
                    required={required}
                    value={screenAnswers[q.id] || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              );
            }
            if (type === "choice" && q.options && q.options.length > 0) {
              return (
                <div key={q.id}>
                  {label}
                  <select
                    required={required}
                    value={screenAnswers[q.id] || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            if (type === "number") {
              return (
                <div key={q.id}>
                  {label}
                  <input
                    type="number"
                    required={required}
                    value={screenAnswers[q.id] || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className={inputClass}
                  />
                </div>
              );
            }
            return (
              <div key={q.id}>
                {label}
                <input
                  type="text"
                  required={required}
                  value={screenAnswers[q.id] || ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Message{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything you'd like us to know…"
          className={inputClass}
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
