/**
 * GET/POST /api/invoices — company_admin+
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  isAuthError,
} from "@/lib/tenant-guard";
import { createInvoiceSchema } from "@/lib/schemas/invoice";
import {
  listInvoices,
  createInvoice,
  getInvoiceTemplate,
  getDefaultInvoiceTemplate,
} from "@/lib/db/repositories/invoice-repository";
import { getTenantById } from "@/lib/db/repositories/tenant-repository";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { parseSalaryBasis } from "@/lib/invoices/fee";
import { recordInvoiceOnCompany } from "@/lib/events/company-events";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const invoices = await listInvoices(tenantId);
    return NextResponse.json({ invoices });
  } catch (e) {
    console.error("[invoices GET]", e);
    return NextResponse.json({ error: "Failed to list invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const tenant = await getTenantById(tenantId);
    let jobTitle: string | undefined;
    let salaryBasis = data.salary_basis;
    let salaryLabel = data.salary_range_label;
    let clientName = data.client_name;
    /** Company record to attach activity/notes */
    let companyId = data.client_id || undefined;

    if (data.job_id) {
      const job = await getJobById(tenantId, data.job_id);
      if (job) {
        jobTitle = job.title;
        if (!companyId) {
          companyId =
            (job as { companyId?: string }).companyId ||
            (job as { company_id?: string }).company_id ||
            undefined;
        }
        if (!salaryBasis) {
          const parsedSal = parseSalaryBasis(
            (job as { salaryRange?: string }).salaryRange ||
              (job as { salary_range?: string }).salary_range
          );
          salaryBasis = parsedSal.basis ?? undefined;
          salaryLabel = salaryLabel || parsedSal.label;
        }
        if (!clientName || clientName === "Client") {
          clientName =
            (job as { companyName?: string }).companyName ||
            (job as { company_name?: string }).company_name ||
            clientName;
        }
      }
    }

    const template = data.template_id
      ? await getInvoiceTemplate(tenantId, data.template_id)
      : await getDefaultInvoiceTemplate(tenantId);

    const invoice = await createInvoice(
      tenantId,
      {
        ...data,
        client_id: companyId,
        client_name: clientName,
        salary_basis: salaryBasis,
        salary_range_label: salaryLabel,
      },
      {
        createdBy: auth.email || auth.userId,
        jobTitle,
        template,
        orgLogoUrl: tenant?.logo_url,
        orgName: tenant?.name,
        orgPrimaryColor: tenant?.primary_color,
      }
    );

    // Activity + notes on the company record
    if (companyId) {
      try {
        await recordInvoiceOnCompany(
          companyId,
          {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            total: invoice.total,
            status: invoice.status,
            job_id: invoice.job_id,
            job_title: invoice.job_title,
            candidate_name: invoice.candidate_name,
            currency: invoice.currency,
          },
          auth.email || auth.userId
        );
      } catch (logErr) {
        console.warn("[invoices] company activity log failed:", logErr);
      }
    }

    return NextResponse.json(
      { invoice, company_activity_logged: !!companyId },
      { status: 201 }
    );
  } catch (e) {
    console.error("[invoices POST]", e);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
