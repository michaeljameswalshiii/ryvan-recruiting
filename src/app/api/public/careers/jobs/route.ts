/**
 * Public careers job feed — multi-tenant.
 *
 * GET /api/public/careers/jobs?tenant={slug}
 * GET /api/public/careers/jobs?tenant={slug}&id={jobId}
 */

import { NextRequest } from "next/server";
import { getAllJobs, getJobById } from "@/lib/db/repositories/job-repository";
import {
  assertCareersAccess,
  clientIp,
  getAppBaseUrl,
  jsonWithCors,
  optionsCors,
  isJobListedOnWebsite,
  resolveCareersTenant,
  toPublicJob,
} from "@/lib/careers/public";
import { checkRateLimit } from "@/lib/rate-limit";

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request);
}

export async function GET(request: NextRequest) {
  try {
    const auth = assertCareersAccess(request);
    if (!auth.ok) return auth.response;

    const rl = checkRateLimit(`careers-jobs:${clientIp(request)}`);
    if (!rl.allowed) {
      return jsonWithCors(
        request,
        { error: "Rate limit exceeded. Try again shortly." },
        429
      );
    }

    const tenantParam = request.nextUrl.searchParams.get("tenant");
    const ctx = await resolveCareersTenant(tenantParam);
    if (!ctx) {
      return jsonWithCors(
        request,
        {
          error:
            "Unknown or missing tenant. Pass ?tenant={slug} (e.g. ryvan).",
        },
        tenantParam ? 404 : 400
      );
    }

    const jobId = request.nextUrl.searchParams.get("id");
    const baseUrl = getAppBaseUrl(request);

    if (jobId) {
      const job = await getJobById(ctx.tenantId, jobId);
      if (!job || !isJobListedOnWebsite(job)) {
        return jsonWithCors(request, { error: "Job not found" }, 404);
      }
      return jsonWithCors(request, {
        job: toPublicJob(job, baseUrl, ctx.slug),
        tenant: { slug: ctx.slug, name: ctx.name },
      });
    }

    const all = await getAllJobs(ctx.tenantId);
    const jobs = all
      .filter((j) => j.id && isJobListedOnWebsite(j))
      .map((j) => toPublicJob(j, baseUrl, ctx.slug))
      .sort((a, b) => {
        const ta = a.postedAt || "";
        const tb = b.postedAt || "";
        return tb.localeCompare(ta);
      });

    return jsonWithCors(request, {
      jobs,
      count: jobs.length,
      tenant: { slug: ctx.slug, name: ctx.name, id: ctx.tenantId },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[public/careers/jobs]", err);
    return jsonWithCors(
      request,
      { error: "Failed to load careers jobs" },
      500
    );
  }
}
