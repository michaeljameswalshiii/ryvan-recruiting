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
import { CareersBrandHeader } from "@/components/careers/CareersBrandHeader";
import { CareersTalentNetwork } from "@/components/careers/CareersTalentNetwork";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props) {
  const { tenant } = await params;
  const ctx = await resolveCareersTenant(tenant);
  if (!ctx) return { title: "Careers" };
  return {
    title: `Careers | ${ctx.name}`,
    description: ctx.tagline || `Open roles at ${ctx.name}`,
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
      <CareersBrandHeader
        name={ctx.name}
        slug={ctx.slug}
        logoUrl={ctx.logoUrl}
        primaryColor={ctx.primaryColor}
        tagline={ctx.tagline}
        websiteUrl={ctx.websiteUrl}
      />

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Always on — above search / open roles */}
        <CareersTalentNetwork
          tenantSlug={ctx.slug}
          orgName={ctx.name}
          defaultOpen={jobs.length === 0 && !loadError}
        />

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
              Check back soon — or use Join our talent network above to send
              your resume for future opportunities.
            </p>
          </div>
        ) : (
          <CareersJobList
            jobs={jobs}
            hideCompany={hideCompany}
            tenantSlug={ctx.slug}
          />
        )}

        <p className="text-center text-xs text-slate-400">
          Applications go to {ctx.name} · Powered by Trio Recruiting
        </p>
      </main>
    </div>
  );
}
