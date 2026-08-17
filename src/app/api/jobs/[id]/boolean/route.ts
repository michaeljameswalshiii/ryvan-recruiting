/**
 * Boolean Generator
 * GET  /api/jobs/[id]/boolean          — cached strings if any
 * POST /api/jobs/[id]/boolean          — generate (or return cache)
 *   body: { regenerate?: boolean }
 * PATCH /api/jobs/[id]/boolean         — save recruiter edits
 *   body: { strings: [{ label, platform, query, notes }] }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTenantId,
  getSessionUserId,
} from "@/lib/server-auth";
import {
  getJobById,
  updateJob,
} from "@/lib/db/repositories/job-repository";
import {
  BOOLEAN_PROMPT_VERSION,
  ensureIndeedVariants,
  fallbackBooleanStrings,
  parseBooleanPayload,
  type BooleanCache,
} from "@/lib/sourcing/boolean-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

function readCache(job: { booleanStrings?: BooleanCache } | null): BooleanCache | null {
  const cache = job?.booleanStrings;
  if (!cache || !Array.isArray(cache.strings) || cache.strings.length === 0) {
    return null;
  }
  return cache;
}

function jobInputFrom(job: {
  title?: string | null;
  location?: string | null;
  tags?: string[] | null;
  salaryRange?: string | null;
  description?: string | null;
  employmentType?: string | null;
  companyName?: string | null;
  confidential?: boolean | null;
}) {
  return {
    title: job.title,
    location: job.location,
    tags: job.tags,
    salaryRange: job.salaryRange,
    description: job.description,
    employmentType: job.employmentType,
    companyName: job.companyName,
    confidential: job.confidential,
  };
}

function withIndeedCoverage(
  cache: BooleanCache,
  job: Parameters<typeof ensureIndeedVariants>[1]
): BooleanCache {
  return {
    ...cache,
    strings: ensureIndeedVariants(cache.strings, job),
  };
}

export async function GET(_request: NextRequest, context: RouteCtx) {
  try {
    const { id: jobId } = await context.params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const cache = readCache(job as { booleanStrings?: BooleanCache });
    const upgraded = cache
      ? withIndeedCoverage(cache, jobInputFrom(job))
      : null;
    return NextResponse.json({
      cached: Boolean(upgraded),
      promptVersion: BOOLEAN_PROMPT_VERSION,
      ...(upgraded || { strings: [] }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Boolean strings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteCtx) {
  try {
    const { id: jobId } = await context.params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (await getSessionUserId()) || undefined;
    const body = await request.json().catch(() => ({}));
    const regenerate = Boolean(
      (body as { regenerate?: unknown }).regenerate
    );

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const existing = readCache(job as { booleanStrings?: BooleanCache });
    if (existing && !regenerate) {
      const upgraded = withIndeedCoverage(existing, jobInputFrom(job));
      return NextResponse.json({
        cached: true,
        regenerated: false,
        promptVersion: BOOLEAN_PROMPT_VERSION,
        ...upgraded,
      });
    }

    const jobInput = jobInputFrom(job);

    const { generateJobBooleanStrings } = await import(
      "@/lib/sourcing/generate-boolean"
    );
    const generate = generateJobBooleanStrings({
      job: jobInput,
      tenantId,
      userId,
      jobId,
    });
    const timed = new Promise<{ cache: BooleanCache }>((resolve) => {
      const t = setTimeout(() => {
        resolve({
          cache: {
            generatedAt: new Date().toISOString(),
            promptVersion: BOOLEAN_PROMPT_VERSION,
            model: "fallback-timeout",
            strings: fallbackBooleanStrings(jobInput),
          },
        });
      }, 18_000);
      void generate
        .then((result) => {
          clearTimeout(t);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(t);
          console.warn("[boolean-generator] generate failed", err);
          resolve({
            cache: {
              generatedAt: new Date().toISOString(),
              promptVersion: BOOLEAN_PROMPT_VERSION,
              model: "fallback-error",
              strings: fallbackBooleanStrings(jobInput),
            },
          });
        });
    });
    const { cache } = await timed;

    try {
      await updateJob(tenantId, jobId, { booleanStrings: cache });
    } catch (persistErr) {
      console.warn("[boolean-generator] cache persist failed", persistErr);
    }

    return NextResponse.json({
      cached: false,
      regenerated: regenerate,
      promptVersion: BOOLEAN_PROMPT_VERSION,
      ...cache,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate Boolean strings";
    console.error("[boolean-generator]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteCtx) {
  try {
    const { id: jobId } = await context.params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const strings = parseBooleanPayload(body);
    if (!strings.length) {
      return NextResponse.json(
        { error: "Provide at least one Boolean string to save" },
        { status: 400 }
      );
    }

    const previous = readCache(job as { booleanStrings?: BooleanCache });
    const cache: BooleanCache = {
      generatedAt: previous?.generatedAt || new Date().toISOString(),
      editedAt: new Date().toISOString(),
      promptVersion: previous?.promptVersion || BOOLEAN_PROMPT_VERSION,
      model: previous?.model,
      strings,
    };

    await updateJob(tenantId, jobId, { booleanStrings: cache });

    return NextResponse.json({
      cached: true,
      saved: true,
      promptVersion: BOOLEAN_PROMPT_VERSION,
      ...cache,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save Boolean strings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
