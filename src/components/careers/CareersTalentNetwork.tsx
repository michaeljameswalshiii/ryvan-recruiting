"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Users } from "lucide-react";

type Props = {
  tenantSlug: string;
  orgName?: string;
  /** Start expanded (e.g. when there are no open roles) */
  defaultOpen?: boolean;
};

const MAX_MB = 10;
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Always-on “Join our talent network” block on the public careers list.
 * Creates a candidate without linking to a job (source: website-careers-talent-network).
 */
export function CareersTalentNetwork({
  tenantSlug,
  orgName,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [interests, setInterests] = useState("");
  const [message, setMessage] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!resumeFile) {
      setStatus("err");
      setError("Please attach your resume (PDF or Word)");
      return;
    }
    setStatus("loading");
    try {
      const form = new FormData();
      form.set("mode", "talent_network");
      form.set("tenant", tenantSlug);
      form.set("name", name);
      form.set("email", email);
      form.set("phone", phone);
      form.set("linkedinUrl", linkedinUrl);
      form.set("interests", interests);
      form.set("message", message);
      form.set("website", website);
      form.set("resume", resumeFile);

      const res = await fetch("/api/public/careers/apply", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
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

  return (
    <section
      id="talent-network"
      className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-5 text-left transition hover:bg-slate-50/80"
        aria-expanded={open}
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Users className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-slate-900">
            Join our talent network
          </span>
          <span className="mt-1 block text-sm text-slate-500">
            Don&apos;t see the position you&apos;re looking for? That&apos;s
            okay. Send us your resume and a quick note about the type of role
            you&apos;re seeking, and we&apos;ll keep you in mind as new
            opportunities become available.
          </span>
        </span>
        <ChevronDown
          className={`mt-2 h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-6 pt-4">
          {status === "ok" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
              <p className="font-medium text-emerald-900">
                You&apos;re in the talent network
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                Thanks for submitting your resume. We&apos;ll keep you in mind
                for future roles.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
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
                <div className="sm:col-span-1">
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    LinkedIn{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://www.linkedin.com/in/yourname"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Interest / role preferences{" "}
                  <span className="font-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="e.g. Project Manager roles in commercial construction, South Florida…"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Resume *{" "}
                  <span className="font-normal text-slate-400">
                    (PDF or Word, max {MAX_MB}MB)
                  </span>
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  required
                  accept={ACCEPT}
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
                {resumeFile ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Selected:{" "}
                    <span className="font-medium text-slate-700">
                      {resumeFile.name}
                    </span>{" "}
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
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Message{" "}
                  <span className="font-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Anything else you'd like us to know…"
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
                {status === "loading"
                  ? "Submitting…"
                  : "Submit resume to talent network"}
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
