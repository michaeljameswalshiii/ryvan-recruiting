/**
 * GET /api/search?q=...
 * Global search: candidates, companies, contacts, jobs.
 * Works for a single tenant and for System Admin "All Tenants".
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { isSiteAdmin } from "@/lib/roles";
import { getAllLeads } from "@/lib/db/repositories/lead-repository";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { getAllContactsForTenant } from "@/lib/db/repositories/contact-repository";
import { getAllTenants } from "@/lib/db/repositories/tenant-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type GlobalSearchHit = {
  id: string;
  type: "candidate" | "company" | "contact" | "job";
  title: string;
  subtitle?: string;
  href: string;
};

type TenantTarget = { id: string; name?: string };

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function personName(row: Record<string, unknown>): string {
  const direct =
    row.name ||
    row.full_name ||
    row.fullName ||
    row.displayName;
  if (direct) return String(direct);
  const first = row.firstName || row.first_name;
  const last = row.lastName || row.last_name;
  const joined = [first, last].filter(Boolean).join(" ");
  return joined || "";
}

function scoreMatch(query: string, ...fields: unknown[]): number {
  const q = norm(query);
  if (!q) return 0;
  const hay = fields.map(norm).filter(Boolean);
  let best = 0;
  const qDigits = q.replace(/\D/g, "");
  const qTokens = q.split(/\s+/).filter(Boolean);
  for (const h of hay) {
    if (!h) continue;
    if (h === q) best = Math.max(best, 100);
    else if (h.startsWith(q)) best = Math.max(best, 80);
    else if (h.includes(q)) best = Math.max(best, 55);
    const nameTokens = h.split(/[\s,./_-]+/).filter(Boolean);
    for (const token of nameTokens) {
      if (token === q) best = Math.max(best, 95);
      else if (token.startsWith(q)) best = Math.max(best, 88);
    }
    if (qTokens.length > 1 && qTokens.every((t) => h.includes(t))) {
      best = Math.max(best, 70);
    }
    if (qDigits.length >= 3) {
      const hDigits = h.replace(/\D/g, "");
      if (hDigits && hDigits.includes(qDigits)) best = Math.max(best, 70);
    }
  }
  return best;
}

function pushContactHit(
  scored: Array<GlobalSearchHit & { score: number }>,
  seen: Set<string>,
  c: Record<string, unknown>,
  companyId: string,
  companyName: string,
  tenantName: string | undefined,
  q: string
) {
  const cname = personName(c);
  if (!cname && !c.email && !c.phone) return;
  const cid = String(c.id || `${companyId}-${cname}`);
  if (!cid || seen.has(cid)) return;
  const extraPhones = Array.isArray(c.phones)
    ? (c.phones as Array<{ number?: string }>).map((p) => p.number)
    : [];
  const cscore = scoreMatch(
    q,
    cname,
    c.email,
    c.title,
    c.phone,
    c.preferredPhone,
    companyName,
    ...extraPhones
  );
  if (cscore <= 0) return;
  seen.add(cid);
  scored.push({
    id: cid,
    type: "contact",
    title: cname || "Contact",
    subtitle: withTenant(
      [c.title, companyName, c.email].filter(Boolean).join(" · "),
      tenantName
    ),
    href: companyId
      ? `/dashboard/contact-info/${encodeURIComponent(cid)}?companyId=${encodeURIComponent(companyId)}`
      : `/dashboard/contact-info/${encodeURIComponent(cid)}`,
    score: cscore,
  });
}

function withTenant(subtitle: string, tenantName?: string): string | undefined {
  const bits = [subtitle, tenantName].filter(Boolean);
  return bits.length ? bits.join(" · ") : undefined;
}

async function searchOneTenant(
  tenant: TenantTarget,
  q: string
): Promise<Array<GlobalSearchHit & { score: number }>> {
  const tenantId = tenant.id;
  const tenantName = tenant.name;
  const scored: Array<GlobalSearchHit & { score: number }> = [];

  const [leads, clients, jobs, contacts] = await Promise.all([
    getAllLeads(tenantId).catch(() => []),
    getAllClients(tenantId).catch(() => []),
    getAllJobs(tenantId).catch(() => []),
    getAllContactsForTenant(tenantId).catch(() => []),
  ]);

  for (const lead of Array.isArray(leads) ? leads : []) {
    const id = String(lead.id || "");
    if (!id) continue;
    const row = lead as unknown as Record<string, unknown>;
    const name = personName(row) || "Candidate";
    const company =
      typeof row.company === "string"
        ? row.company
        : typeof row.currentCompany === "string"
          ? row.currentCompany
          : "";
    const score = scoreMatch(
      q,
      name,
      lead.email,
      lead.phone,
      lead.title,
      company,
      lead.location
    );
    if (score <= 0) continue;
    scored.push({
      id,
      type: "candidate",
      title: String(name),
      subtitle: withTenant(
        [lead.title, lead.email, company]
          .filter(Boolean)
          .join(" · "),
        tenantName
      ),
      href: `/dashboard/candidates/${id}`,
      score,
    });
  }

  const seenContacts = new Set<string>();

  for (const client of Array.isArray(clients) ? clients : []) {
    const id = String(client.id || "");
    if (!id) continue;
    const sk = String(
      (client as { SK?: string; sk?: string }).SK ||
        (client as { SK?: string; sk?: string }).sk ||
        ""
    );
    if (sk.startsWith("CONTACT#")) continue;
    const companyName =
      client.name || client.companyName || client.company || "Company";
    const companyScore = scoreMatch(
      q,
      companyName,
      client.domain,
      client.industry,
      client.city,
      client.state,
      client.email
    );
    if (companyScore > 0) {
      scored.push({
        id,
        type: "company",
        title: String(companyName),
        subtitle: withTenant(
          [client.industry, client.city, client.state].filter(Boolean).join(" · "),
          tenantName
        ),
        href: `/dashboard/companies/${id}`,
        score: companyScore,
      });
    }

    const embedded = Array.isArray(client.contacts) ? client.contacts : [];
    for (const c of embedded) {
      pushContactHit(
        scored,
        seenContacts,
        (c || {}) as Record<string, unknown>,
        id,
        String(companyName),
        tenantName,
        q
      );
    }
  }

  for (const c of Array.isArray(contacts) ? contacts : []) {
    pushContactHit(
      scored,
      seenContacts,
      c as unknown as Record<string, unknown>,
      String(c.companyId || ""),
      String((c as { companyName?: string }).companyName || ""),
      tenantName,
      q
    );
  }

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const id = String(job.id || "");
    if (!id) continue;
    const title = job.title || "Untitled job";
    const score = scoreMatch(
      q,
      title,
      job.companyName,
      job.location,
      job.status,
      job.employmentType
    );
    if (score <= 0) continue;
    scored.push({
      id,
      type: "job",
      title: String(title),
      subtitle: withTenant(
        [job.companyName, job.status, job.location].filter(Boolean).join(" · "),
        tenantName
      ),
      href: `/dashboard/jobs/${id}`,
      score,
    });
  }

  return scored;
}

async function resolveTenants(): Promise<
  { tenants: TenantTarget[]; error?: string; status?: number }
> {
  const session = await getSession();
  if (!session?.userId) {
    return { tenants: [], error: "Unauthorized", status: 401 };
  }

  const scoped = await getSessionTenantId();
  if (scoped) {
    return { tenants: [{ id: scoped }] };
  }

  if (isSiteAdmin(session.role)) {
    const all = await getAllTenants({ includePlatform: false });
    return {
      tenants: (all || []).map((t) => ({ id: t.id, name: t.name })),
    };
  }

  return { tenants: [], error: "Unauthorized", status: 401 };
}

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20,
      40
    );

    if (q.length < 2) {
      return NextResponse.json({
        query: q,
        results: [] as GlobalSearchHit[],
      });
    }

    const resolved = await resolveTenants();
    if (resolved.error) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status || 401 }
      );
    }

    const tenants = resolved.tenants;
    if (tenants.length === 0) {
      return NextResponse.json({
        query: q,
        results: [] as GlobalSearchHit[],
      });
    }

    const scored: Array<GlobalSearchHit & { score: number }> = [];
    const batchSize = 4;
    for (let i = 0; i < tenants.length; i += batchSize) {
      const batch = tenants.slice(i, i + batchSize);
      const parts = await Promise.all(
        batch.map((t) => searchOneTenant(t, q).catch(() => []))
      );
      for (const part of parts) scored.push(...part);
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    const perType = 8;
    const counts: Record<string, number> = {};
    const results: GlobalSearchHit[] = [];
    for (const hit of scored) {
      counts[hit.type] = (counts[hit.type] || 0) + 1;
      if (counts[hit.type] > perType) continue;
      results.push({
        id: hit.id,
        type: hit.type,
        title: hit.title,
        subtitle: hit.subtitle,
        href: hit.href,
      });
      if (results.length >= limit) break;
    }

    return NextResponse.json({ query: q, results });
  } catch (error: unknown) {
    console.error("[GET /api/search]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
