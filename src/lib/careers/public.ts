/**
 * Public careers feed helpers — multi-tenant safe fields, no session required.
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import type { Job } from "@/lib/schemas/job";
import {
  getTenantById,
  getTenantBySubdomain,
} from "@/lib/db/repositories/tenant-repository";

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
  showOnWebsite: boolean;
  postedAt: string | null;
  updatedAt: string | null;
  applyUrl: string;
  detailUrl: string;
  tenantSlug: string;
};

export type CareersTenantContext = {
  tenantId: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  tagline?: string | null;
};

function brandFromTenant(
  t: {
    name?: string;
    subdomain?: string;
    logo_url?: string;
    logo_s3_key?: string;
    primary_color?: string;
    careers_tagline?: string;
  } | null,
  fallbackSlug: string
): Pick<CareersTenantContext, "name" | "logoUrl" | "primaryColor" | "tagline"> {
  const slug = (t?.subdomain || fallbackSlug || "careers").toLowerCase();
  // Prefer stored URL; if S3 key exists use public proxy; else static branding file
  let logoUrl = t?.logo_url || null;
  if (!logoUrl && t?.logo_s3_key) {
    logoUrl = `/api/public/careers/logo?tenant=${encodeURIComponent(slug)}`;
  }
  if (!logoUrl) {
    // Static multi-tenant fallback: public/branding/{slug}-logo.jpg|png|svg
    logoUrl = `/branding/${slug}-logo.jpg`;
  }
  return {
    name: t?.name || fallbackSlug,
    logoUrl,
    primaryColor: t?.primary_color || null,
    tagline: t?.careers_tagline || null,
  };
}

/**
 * Eligible for public careers listing:
 * - status is Open (case-insensitive)
 * - showOnWebsite is not explicitly false
 *   (legacy jobs without the field stay public; new jobs default false)
 */
export function isJobListedOnWebsite(job: {
  status?: string;
  showOnWebsite?: boolean;
}): boolean {
  // Only canonical Open (legacy OPEN/active also normalize to Open)
  const status = (job.status || "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  const open =
    status === "open" || status === "active" || status === "hiring" || status === "live";
  if (!open) return false;
  if (job.showOnWebsite === false) return false;
  return true;
}

function parseTenantSlugMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [slug, id] = part.split(":").map((s) => s?.trim());
    if (slug && id) out[slug.toLowerCase()] = id;
  }
  return out;
}

export function isJobIdLike(value: string): boolean {
  const v = value.trim();
  // UUID
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  ) {
    return true;
  }
  // common job id shapes
  if (/^[0-9a-f]{24,}$/i.test(v)) return true;
  return false;
}

/**
 * Resolve a public careers tenant from a URL slug (or env default).
 * Order: env slug map → tenants.subdomain → tenant id direct match.
 */
export async function resolveCareersTenant(
  requested?: string | null
): Promise<CareersTenantContext | null> {
  const slugMap = parseTenantSlugMap(process.env.CAREERS_TENANT_SLUGS || "");
  const defaultId = (process.env.CAREERS_TENANT_ID || "").trim();
  const defaultSlug = (
    process.env.CAREERS_DEFAULT_SLUG ||
    Object.keys(slugMap)[0] ||
    "ryvan"
  )
    .trim()
    .toLowerCase();

  const raw = (requested || "").trim().toLowerCase();

  // No slug: use default tenant
  if (!raw) {
    if (!defaultId) return null;
    const t = await getTenantById(defaultId);
    return {
      tenantId: defaultId,
      slug: (t?.subdomain || defaultSlug).toLowerCase(),
      ...brandFromTenant(t, "Careers"),
    };
  }

  // Explicit env map wins (handles duplicate subdomains)
  if (slugMap[raw]) {
    const tenantId = slugMap[raw];
    const t = await getTenantById(tenantId);
    return {
      tenantId,
      slug: raw,
      ...brandFromTenant(t, raw),
    };
  }

  // Look up by subdomain on tenants table
  const bySub = await getTenantBySubdomain(raw);
  if (bySub?.id) {
    return {
      tenantId: bySub.id,
      slug: (bySub.subdomain || raw).toLowerCase(),
      ...brandFromTenant(bySub, raw),
    };
  }

  // Direct tenant id
  if (raw.startsWith("tenant-") || raw.length > 20) {
    const t = await getTenantById(raw);
    if (t?.id) {
      return {
        tenantId: t.id,
        slug: (t.subdomain || raw).toLowerCase(),
        ...brandFromTenant(t, "Careers"),
      };
    }
  }

  return null;
}

/** @deprecated Prefer resolveCareersTenant — sync helper for env-only paths */
export function getCareersTenantId(requested?: string | null): string | null {
  const configured = (process.env.CAREERS_TENANT_ID || "").trim();
  const slugMap = parseTenantSlugMap(process.env.CAREERS_TENANT_SLUGS || "");
  if (requested) {
    const key = requested.trim().toLowerCase();
    if (slugMap[key]) return slugMap[key];
    if (key === configured) return configured;
    if (Object.values(slugMap).includes(requested.trim())) return requested.trim();
    return null;
  }
  return configured || null;
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

/**
 * Agency default: hide client company label on public careers.
 * Set CAREERS_SHOW_COMPANY_NAME=true to show company publicly.
 */
export function shouldHideCompanyOnCareers(): boolean {
  const v = (process.env.CAREERS_SHOW_COMPANY_NAME || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return false;
  return true;
}

export function toPublicJob(
  job: Job,
  baseUrl: string,
  tenantSlug: string
): PublicJob {
  const id = job.id || "";
  const hideCompany = shouldHideCompanyOnCareers();
  const slug = (tenantSlug || "careers").toLowerCase();

  return {
    id,
    title: job.title || "Untitled role",
    description: (job.description || "").slice(0, 8000),
    location: job.location || "",
    salaryRange: job.salaryRange || "",
    employmentType: job.employmentType || "Full-time",
    companyName: hideCompany ? "" : job.companyName || "",
    status: job.status || "Open",
    showOnWebsite: job.showOnWebsite !== false,
    postedAt: job.created_at || null,
    updatedAt: job.modified_at || null,
    applyUrl: `${baseUrl}/careers/${slug}/${id}#apply`,
    detailUrl: `${baseUrl}/careers/${slug}/${id}`,
    tenantSlug: slug,
  };
}

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
