/**
 * GET /api/search?q=...
 * Global tenant search: candidates, companies, contacts, jobs.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import { getAllLeadsWithLinkedJobs } from "@/lib/db/repositories/lead-repository";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";

export const dynamic = "force-dynamic";

export type GlobalSearchHit = {
  id: string;
  type: "candidate" | "company" | "contact" | "job";
  title: string;
  subtitle?: string;
  href: string;
};

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function scoreMatch(query: string, ...fields: unknown[]): number {
  const q = norm(query);
  if (!q) return 0;
  const hay = fields.map(norm).filter(Boolean);
  let best = 0;
  for (const h of hay) {
    if (!h) continue;
    if (h === q) best = Math.max(best, 100);
    else if (h.startsWith(q)) best = Math.max(best, 80);
    else if (h.includes(q)) best = Math.max(best, 50);
    else {
      // multi-token: all tokens present
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every((t) => h.includes(t))) {
        best = Math.max(best, 60);
      }
    }
  }
  return best;
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const [leads, clients, jobs] = await Promise.all([
      getAllLeadsWithLinkedJobs(tenantId).catch(() => []),
      getAllClients(tenantId).catch(() => []),
      getAllJobs(tenantId).catch(() => []),
    ]);

    const scored: Array<GlobalSearchHit & { score: number }> = [];

    // Candidates
    for (const lead of Array.isArray(leads) ? leads : []) {
      const id = String(lead.id || "");
      if (!id) continue;
      const name =
        lead.full_name ||
        lead.fullName ||
        lead.name ||
        [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
        "Candidate";
      const score = scoreMatch(
        q,
        name,
        lead.email,
        lead.phone,
        lead.title,
        lead.company,
        lead.currentCompany
      );
      if (score <= 0) continue;
      scored.push({
        id,
        type: "candidate",
        title: String(name),
        subtitle: [lead.title, lead.email, lead.company || lead.currentCompany]
          .filter(Boolean)
          .join(" · "),
        href: `/dashboard/candidates/${id}`,
        score,
      });
    }

    // Companies + nested contacts
    for (const client of Array.isArray(clients) ? clients : []) {
      const id = String(client.id || "");
      if (!id) continue;
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
          subtitle: [client.industry, client.city, client.state]
            .filter(Boolean)
            .join(" · "),
          href: `/dashboard/companies/${id}`,
          score: companyScore,
        });
      }

      const contacts = Array.isArray(client.contacts) ? client.contacts : [];
      for (const c of contacts) {
        const cid = String(c.id || "");
        if (!cid) continue;
        const cname = c.name || c.full_name || "Contact";
        const cscore = scoreMatch(q, cname, c.email, c.title, c.phone);
        if (cscore <= 0) continue;
        scored.push({
          id: cid,
          type: "contact",
          title: String(cname),
          subtitle: [c.title, companyName, c.email].filter(Boolean).join(" · "),
          href: `/dashboard/contact-info/${cid}?companyId=${encodeURIComponent(id)}`,
          score: cscore,
        });
      }
    }

    // Jobs
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
        subtitle: [job.companyName, job.status, job.location]
          .filter(Boolean)
          .join(" · "),
        href: `/dashboard/jobs/${id}`,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    // Cap per type so one type doesn't dominate
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
