/**
 * Public careers apply — creates candidate + links to open job.
 *
 * POST /api/public/careers/apply
 * Body: { jobId, name, email, phone?, message?, resumeUrl?, tenant?, website? }
 * website = honeypot (must be empty)
 */

import { NextRequest } from "next/server";
import { getJobById, linkCandidateToJob } from "@/lib/db/repositories/job-repository";
import { createLead } from "@/lib/db/repositories/lead-repository";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertCareersAccess,
  clientIp,
  getCareersTenantId,
  jsonWithCors,
  optionsCors,
} from "@/lib/careers/public";

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request);
}

export async function POST(request: NextRequest) {
  try {
    const auth = assertCareersAccess(request);
    if (!auth.ok) return auth.response;

    const rl = checkRateLimit(`careers-apply:${clientIp(request)}`);
    if (!rl.allowed) {
      return jsonWithCors(
        request,
        { error: "Too many applications. Please try again later." },
        429
      );
    }

    const body = await request.json().catch(() => ({}));
    const honeypot = String(body.website || body.company_url || "").trim();
    if (honeypot) {
      // Silent success for bots
      return jsonWithCors(request, { success: true });
    }

    const jobId = String(body.jobId || body.job_id || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const message = String(body.message || body.coverLetter || "").trim();
    const resumeUrl = String(body.resumeUrl || body.resume_url || "").trim();
    const tenantParam = body.tenant ? String(body.tenant) : null;

    if (!jobId || !name || !email) {
      return jsonWithCors(
        request,
        { error: "jobId, name, and email are required" },
        400
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonWithCors(request, { error: "Invalid email address" }, 400);
    }

    if (name.length > 100 || email.length > 200 || message.length > 2000) {
      return jsonWithCors(request, { error: "Input too long" }, 400);
    }

    const tenantId = getCareersTenantId(tenantParam);
    if (!tenantId) {
      return jsonWithCors(
        request,
        { error: "Careers apply not configured (CAREERS_TENANT_ID)" },
        503
      );
    }

    const job = await getJobById(tenantId, jobId);
    if (!job || (job.status || "").trim().toLowerCase() !== "open") {
      return jsonWithCors(
        request,
        { error: "This job is not open for applications" },
        404
      );
    }

    const notes = [
      `Applied via public careers page for: ${job.title}`,
      message ? `Message:\n${message}` : "",
      resumeUrl ? `Resume: ${resumeUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const lead = await createLead(tenantId, {
      name,
      email,
      phone,
      title: job.title || "",
      status: "identification",
      source: "website-careers",
      notes,
      resume_url: resumeUrl || "",
      location: job.location || "",
    });

    try {
      await linkCandidateToJob(tenantId, jobId, {
        candidateId: lead.id!,
        candidateName: lead.name,
        candidateEmail: lead.email || email,
        stage: "sourced",
        notes: message ? message.slice(0, 500) : "Applied via careers site",
      });
    } catch (linkErr) {
      // Candidate created; link may fail if already linked
      console.warn("[careers/apply] link warning:", linkErr);
    }

    return jsonWithCors(request, {
      success: true,
      message: "Application received. Thank you!",
      applicationId: lead.id,
      job: { id: job.id, title: job.title },
    });
  } catch (err) {
    console.error("[public/careers/apply]", err);
    return jsonWithCors(
      request,
      { error: "Failed to submit application" },
      500
    );
  }
}
