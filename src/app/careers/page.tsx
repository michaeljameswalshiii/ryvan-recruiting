/**
 * Public careers listing — no login required.
 * Configure CAREERS_TENANT_ID so Open jobs appear here.
 */

import Link from "next/link";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import {
  getCareersTenantId,
  getAppBaseUrl,
  isJobListedOnWebsite,
  toPublicJob,
} from "@/lib/careers/public";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Careers | Open Roles",
  description: "View open positions and apply online.",
};

export default async function CareersPage() {
  const tenantId = getCareersTenantId(null);
  const baseUrl = getAppBaseUrl();

  let jobs: ReturnType<typeof toPublicJob>[] = [];
  let configError: string | null = null;

  if (!tenantId) {
    configError =
      "Careers are not configured yet. Set CAREERS_TENANT_ID in the environment.";
  } else {
    try {
      const all = await getAllJobs(tenantId);
      jobs = all
        .filter((j) => j.id && isJobListedOnWebsite(j))
        .map((j) => toPublicJob(j, baseUrl))
        .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));
    } catch (e) {
      console.error("[careers page]", e);
      configError = "Unable to load open roles right now.";
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Careers
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">Open roles</h1>
          </div>
          <Link
            href="/login"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Recruiter login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {configError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {configError}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <p className="text-lg font-medium text-slate-800">
              No open positions right now
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Check back soon — new roles appear here when marked Open in the ATS.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/careers/${job.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {job.title}
                    </h2>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                      {job.employmentType}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {job.companyName && <span>{job.companyName}</span>}
                    {job.location && <span>{job.location}</span>}
                    {job.salaryRange && <span>{job.salaryRange}</span>}
                  </div>
                  {job.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                      {job.description}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-medium text-slate-900">
                    View &amp; apply →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          Powered by Turnkey Optimization · Jobs sync from the ATS when status is
          Open
        </p>
      </main>
    </div>
  );
}
