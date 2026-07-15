/**
 * Public careers listing — no login required.
 * Searchable list; company names hidden by default (agency mode).
 */

import { getAllJobs } from "@/lib/db/repositories/job-repository";
import {
  getCareersTenantId,
  getAppBaseUrl,
  isJobListedOnWebsite,
  shouldHideCompanyOnCareers,
  toPublicJob,
} from "@/lib/careers/public";
import { CareersJobList } from "@/components/careers/CareersJobList";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Careers | Open Roles",
  description: "Search open positions and apply online.",
};

export default async function CareersPage() {
  const tenantId = getCareersTenantId(null);
  const baseUrl = getAppBaseUrl();
  const hideCompany = shouldHideCompanyOnCareers();

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
        <div className="mx-auto max-w-3xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Careers
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Open roles</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search roles and apply through our recruiting team.
          </p>
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
              Check back soon — new roles appear here when published from the ATS.
            </p>
          </div>
        ) : (
          <CareersJobList jobs={jobs} hideCompany={hideCompany} />
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          Applications go to our recruiting team · Powered by Turnkey Optimization
        </p>
      </main>
    </div>
  );
}
