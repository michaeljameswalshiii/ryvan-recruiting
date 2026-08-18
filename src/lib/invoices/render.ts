/**
 * Build the downloadable invoice file (custom template or Trio PDF).
 * @serverOnly
 */

import type { Invoice, InvoiceSourceKind } from "@/lib/schemas/invoice";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import {
  exportGoogleDocDocx,
  fillDocxBuffer,
  fillPdfBuffer,
  invoiceMergeVars,
} from "@/lib/invoices/merge";
import { getInvoiceTemplateFile } from "@/lib/invoices/source-file";

export type RenderedInvoice = {
  buffer: Buffer;
  contentType: string;
  filename: string;
  kind: InvoiceSourceKind;
};

function sourceKind(invoice: Invoice): InvoiceSourceKind {
  const kind = invoice.source_kind;
  if (kind === "google_doc" || kind === "docx" || kind === "pdf") return kind;
  if (invoice.source_url) return "google_doc";
  if ((invoice.source_file_type || "").includes("pdf")) return "pdf";
  if (invoice.source_file_key) return "docx";
  return "built_in";
}

export async function renderInvoiceFile(
  invoice: Invoice,
  tenantId: string
): Promise<RenderedInvoice> {
  const kind = sourceKind(invoice);
  const vars = invoiceMergeVars(invoice);
  const base = (invoice.invoice_number || invoice.id || "invoice").replace(
    /[^\w.-]+/g,
    "_"
  );

  if (kind === "google_doc") {
    if (!invoice.source_url) {
      throw new Error("This template is missing a Google Doc link.");
    }
    const exported = await exportGoogleDocDocx(invoice.source_url);
    const filled = await fillDocxBuffer(exported, vars);
    return {
      buffer: filled,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${base}.docx`,
      kind,
    };
  }

  if (kind === "docx") {
    if (!invoice.source_file_key) {
      throw new Error("This template is missing the uploaded Word file.");
    }
    const raw = await getInvoiceTemplateFile(invoice.source_file_key, tenantId);
    const filled = await fillDocxBuffer(raw, vars);
    return {
      buffer: filled,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${base}.docx`,
      kind,
    };
  }

  if (kind === "pdf") {
    if (!invoice.source_file_key) {
      throw new Error("This template is missing the uploaded PDF.");
    }
    const raw = await getInvoiceTemplateFile(invoice.source_file_key, tenantId);
    const stamp = [invoice.invoice_number, invoice.client_name, vars.total]
      .filter(Boolean)
      .join("  ·  ");
    const filled = await fillPdfBuffer(raw, vars, stamp);
    return {
      buffer: filled,
      contentType: "application/pdf",
      filename: `${base}.pdf`,
      kind,
    };
  }

  const pdf = await buildInvoicePdf(invoice);
  return {
    buffer: pdf,
    contentType: "application/pdf",
    filename: `${base}.pdf`,
    kind: "built_in",
  };
}
