/**
 * Public careers job feed — no login required.
 *
 * GET /api/public/careers/jobs
 *   ?tenant=optional-slug-or-id  (defaults to CAREERS_TENANT_ID)
 *   ?key=...                    (if CAREERS_PUBLIC_KEY is set)
 *
 * Returns Open jobs only, public-safe fields.
 */

import { NextRequest } from "next/server";
import { getAllJobs, getJobById } from "@/lib/db/repositories/job-repository";
import {
  assertCareersAccess,
  clientIp,
  getAppBaseUrl,
  getCareersTenantId,
  jsonWithCors,
  optionsCors,
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
    const tenantId = getCareersTenantId(tenantParam);
    if (!tenantId) {
      return jsonWithCors(
        request,
        {
          error:
            "Careers feed not configured. Set CAREERS_TENANT_ID on the server.",
        },
        503
      );
    }

    const jobId = request.nextUrl.searchParams.get("id");
    const baseUrl = getAppBaseUrl(request);

    const isOpen = (status?: string) =>
      (status || "").trim().toLowerCase() === "open";

    if (jobId) {
      const job = await getJobById(tenantId, jobId);
      if (!job || !isOpen(job.status)) {
        return jsonWithCors(request, { error: "Job not found" }, 404);
      }
      return jsonWithCors(request, {
        job: toPublicJob(job, baseUrl),
        tenant: tenantParam || "default",
      });
    }

    const all = await getAllJobs(tenantId);
    const jobs = all
      .filter((j) => j.id && isOpen(j.status))
      .map((j) => toPublicJob(j, baseUrl))
      .sort((a, b) => {
        const ta = a.postedAt || "";
        const tb = b.postedAt || "";
        return tb.localeCompare(ta);
      });

    return jsonWithCors(request, {
      jobs,
      count: jobs.length,
      tenant: tenantParam || "default",
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
