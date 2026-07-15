/**
 * Public job detail + apply form
 * Client company name hidden by default (agency confidential).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@/lib/db/repositories/job-repository";
import {
  getCareersTenantId,
  getAppBaseUrl,
  isJobListedOnWebsite,
  shouldHideCompanyOnCareers,
  toPublicJob,
} from "@/lib/careers/public";
import { CareersApplyForm } from "./apply-form";
import { JobDescription } from "@/components/careers/JobDescription";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const tenantId = getCareersTenantId(null);
  if (!tenantId) return { title: "Job | Careers" };
  const job = await getJobById(tenantId, id);
  return {
    title: job?.title ? `${job.title} | Careers` : "Job | Careers",
    description: job?.description?.slice(0, 160) || "View role and apply",
  };
}

export default async function CareersJobPage({ params }: Props) {
  const { id } = await params;
  const tenantId = getCareersTenantId(null);
  if (!tenantId) notFound();

  const job = await getJobById(tenantId, id);
  if (!job || !isJobListedOnWebsite(job)) notFound();

  const pub = toPublicJob(job, getAppBaseUrl());
  const hideCompany = shouldHideCompanyOnCareers();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link
            href="/careers"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← All open roles
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {pub.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {!hideCompany && pub.companyName && <span>{pub.companyName}</span>}
            {pub.location && <span>{pub.location}</span>}
            {pub.employmentType && <span>{pub.employmentType}</span>}
            {pub.salaryRange && <span>{pub.salaryRange}</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            About the role
          </h2>
          <div className="mt-4">
            <JobDescription description={pub.description} />
          </div>
        </section>

        <section
          id="apply"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">Apply</h2>
          <p className="mt-1 text-sm text-slate-500">
            Submit your application below. It goes to our recruiting team — you
            will not be redirected to the hiring company&apos;s website.
          </p>
          <div className="mt-6">
            <CareersApplyForm jobId={pub.id} jobTitle={pub.title} />
          </div>
        </section>
      </main>
    </div>
  );
}
