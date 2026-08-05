/**
 * Placement invoice PDF generator (jspdf).
 * @serverOnly — used from API routes only.
 */

import { jsPDF } from "jspdf";
import type { Invoice } from "@/lib/schemas/invoice";
import { formatMoney } from "@/lib/invoices/fee";

function hexToRgb(hex?: string): [number, number, number] {
  const h = (hex || "#2563eb").replace("#", "");
  if (h.length !== 6) return [37, 99, 235];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function buildInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;
  const [r, g, b] = hexToRgb(invoice.primary_color);

  // Accent bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 8, "F");

  // Logo (optional)
  if (invoice.logo_url && /^https?:\/\//i.test(invoice.logo_url)) {
    try {
      const imgRes = await fetch(invoice.logo_url);
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const b64 = buf.toString("base64");
        const ct = imgRes.headers.get("content-type") || "image/png";
        const fmt = ct.includes("jpeg") || ct.includes("jpg") ? "JPEG" : "PNG";
        const dataUrl = `data:${ct};base64,${b64}`;
        doc.addImage(dataUrl, fmt, margin, y, 110, 40);
      }
    } catch {
      /* logo optional */
    }
  }

  // Header title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(r, g, b);
  doc.text(invoice.header_text || "INVOICE", pageW - margin, y + 18, {
    align: "right",
  });

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number, pageW - margin, y + 36, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Status: ${(invoice.status || "draft").toUpperCase()}`, pageW - margin, y + 50, {
    align: "right",
  });

  y += 70;

  // From / Bill to
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("FROM", margin, y);
  doc.text("BILL TO", pageW / 2, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  const fromLines = [
    invoice.from_name,
    invoice.from_address,
    invoice.from_email,
    invoice.from_phone,
  ].filter(Boolean) as string[];
  const toLines = [
    invoice.client_name,
    invoice.client_address,
    invoice.client_email,
  ].filter(Boolean) as string[];

  const fromY = y;
  fromLines.forEach((line, i) => {
    doc.text(String(line), margin, fromY + i * 13);
  });
  toLines.forEach((line, i) => {
    doc.text(String(line), pageW / 2, fromY + i * 13);
  });
  y = fromY + Math.max(fromLines.length, toLines.length, 1) * 13 + 20;

  // Meta
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Issue date: ${invoice.issue_date || "—"}`, margin, y);
  doc.text(`Due date: ${invoice.due_date || "—"}`, margin + 160, y);
  if (invoice.job_title) {
    doc.text(`Job: ${invoice.job_title}`, margin + 320, y, { maxWidth: 200 });
  }
  y += 24;

  // Table header
  doc.setFillColor(r, g, b);
  doc.rect(margin, y - 12, pageW - margin * 2, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Description", margin + 8, y);
  doc.text("Qty", pageW - margin - 140, y);
  doc.text("Amount", pageW - margin - 8, y, { align: "right" });
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  for (const li of invoice.line_items || []) {
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
    const desc = li.description || "";
    const split = doc.splitTextToSize(desc, pageW - margin * 2 - 160);
    doc.text(split, margin + 8, y);
    doc.text(String(li.quantity ?? 1), pageW - margin - 140, y);
    doc.text(formatMoney(li.amount || 0, invoice.currency), pageW - margin - 8, y, {
      align: "right",
    });
    y += Math.max(18, split.length * 12 + 6);
  }

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", pageW - margin - 120, y);
  doc.setTextColor(r, g, b);
  doc.text(formatMoney(invoice.total || 0, invoice.currency), pageW - margin - 8, y, {
    align: "right",
  });
  y += 28;

  // Terms
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Payment terms", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const terms = doc.splitTextToSize(
    invoice.payment_terms || "",
    pageW - margin * 2
  );
  doc.text(terms, margin, y);
  y += terms.length * 12 + 16;

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Notes", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const notes = doc.splitTextToSize(invoice.notes, pageW - margin * 2);
    doc.text(notes, margin, y);
    y += notes.length * 12 + 16;
  }

  if (invoice.footer_text) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const foot = doc.splitTextToSize(invoice.footer_text, pageW - margin * 2);
    doc.text(foot, margin, Math.max(y, 740));
  }

  const ab = doc.output("arraybuffer");
  return Buffer.from(ab);
}
