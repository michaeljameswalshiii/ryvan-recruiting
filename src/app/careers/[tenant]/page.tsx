/**
 * Multi-tenant public careers list: /careers/{tenantSlug}
 */

import { notFound, redirect } from "next/navigation";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import {
  getAppBaseUrl,
  isJobIdLike,
  isJobListedOnWebsite,
  resolveCareersTenant,
  shouldHideCompanyOnCareers,
  toPublicJob,
} from "@/lib/careers/public";
import { CareersJobList } from "@/components/careers/CareersJobList";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props) {
  const { tenant } = await params;
  const ctx = await resolveCareersTenant(tenant);
  if (!ctx) return { title: "Careers" };
  return {
    title: `Careers | ${ctx.name}`,
    description: `Open roles at ${ctx.name}`,
  };
}

export default async function TenantCareersPage({ params }: Props) {
  const { tenant: tenantParam } = await params;

  // Legacy: /careers/{jobUuid} → /careers/{defaultSlug}/{jobUuid}
  if (isJobIdLike(tenantParam)) {
    const fallback = await resolveCareersTenant(null);
    if (fallback?.slug) {
      redirect(`/careers/${fallback.slug}/${tenantParam}`);
    }
    notFound();
  }

  const ctx = await resolveCareersTenant(tenantParam);
  if (!ctx) notFound();

  const baseUrl = getAppBaseUrl();
  const hideCompany = shouldHideCompanyOnCareers();

  let jobs: ReturnType<typeof toPublicJob>[] = [];
  let loadError: string | null = null;

  try {
    const all = await getAllJobs(ctx.tenantId);
    jobs = all
      .filter((j) => j.id && isJobListedOnWebsite(j))
      .map((j) => toPublicJob(j, baseUrl, ctx.slug))
      .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));
  } catch (e) {
    console.error("[careers tenant page]", e);
    loadError = "Unable to load open roles right now.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Careers
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">{ctx.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search open roles and apply through our recruiting team.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {loadError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <p className="text-lg font-medium text-slate-800">
              No open positions right now
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Check back soon — new roles appear here when published from the
              ATS.
            </p>
          </div>
        ) : (
          <CareersJobList
            jobs={jobs}
            hideCompany={hideCompany}
            tenantSlug={ctx.slug}
          />
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          Applications go to {ctx.name} · Powered by Turnkey Optimization
        </p>
      </main>
    </div>
  );
}
