/**
 * Public careers feed helpers — safe fields only, no session required.
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import type { Job } from "@/lib/schemas/job";

/** Public job card shown on external sites /careers */
export type PublicJob = {
  id: string;
  title: string;
  description: string;
  location: string;
  salaryRange: string;
  employmentType: string;
  companyName: string;
  status: string;
  postedAt: string | null;
  updatedAt: string | null;
  applyUrl: string;
  detailUrl: string;
};

export function getCareersTenantId(requested?: string | null): string | null {
  const configured = (process.env.CAREERS_TENANT_ID || "").trim();
  if (!configured) return null;

  // Optional slug map: ryvan:tenant-xxx,acme:tenant-yyy
  const slugMap = parseTenantSlugMap(process.env.CAREERS_TENANT_SLUGS || "");
  if (requested) {
    const key = requested.trim();
    if (slugMap[key]) return slugMap[key];
    // Allow exact tenant id match only if it equals configured primary
    // or appears as a value in the slug map
    if (key === configured) return configured;
    if (Object.values(slugMap).includes(key)) return key;
    return null;
  }
  return configured;
}

function parseTenantSlugMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [slug, id] = part.split(":").map((s) => s?.trim());
    if (slug && id) out[slug] = id;
  }
  return out;
}

export function getAppBaseUrl(request?: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  if (request) {
    return request.nextUrl.origin;
  }
  return "https://turnkey-optimization.vercel.app";
}

export function toPublicJob(job: Job, baseUrl: string): PublicJob {
  const id = job.id || "";
  return {
    id,
    title: job.title || "Untitled role",
    description: (job.description || "").slice(0, 5000),
    location: job.location || "",
    salaryRange: job.salaryRange || "",
    employmentType: job.employmentType || "Full-time",
    companyName: job.companyName || "",
    status: job.status || "Open",
    postedAt: job.created_at || null,
    updatedAt: job.modified_at || null,
    applyUrl: `${baseUrl}/careers/${id}#apply`,
    detailUrl: `${baseUrl}/careers/${id}`,
  };
}

/**
 * Auth for public careers API.
 * If CAREERS_PUBLIC_KEY is unset, feed is open (tenant still required).
 * If set, require header x-careers-key or query ?key=
 */
export function assertCareersAccess(request: NextRequest): {
  ok: true;
} | { ok: false; response: NextResponse } {
  const required = (process.env.CAREERS_PUBLIC_KEY || "").trim();
  if (!required) return { ok: true };

  const header =
    request.headers.get("x-careers-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const query = request.nextUrl.searchParams.get("key") || "";
  const provided = (header || query).trim();

  if (!provided || provided !== required) {
    return {
      ok: false,
      response: jsonWithCors(
        request,
        { error: "Unauthorized — invalid or missing careers key" },
        401
      ),
    };
  }
  return { ok: true };
}

export function getAllowedCorsOrigins(): string[] {
  const raw = process.env.CAREERS_CORS_ORIGINS || "*";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const allowed = getAllowedCorsOrigins();
  const allowAll = allowed.includes("*");
  const ok = allowAll || (origin && allowed.includes(origin));

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-careers-key, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  if (allowAll) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
    if (origin) headers["Vary"] = "Origin";
  } else if (ok && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function jsonWithCors(
  request: NextRequest,
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(request),
  });
}

export function optionsCors(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
