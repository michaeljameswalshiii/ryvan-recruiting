/**
 * Fill {{merge}} tokens in Word / PDF invoice templates.
 * @serverOnly
 */

import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { Invoice } from "@/lib/schemas/invoice";
import { formatMoney } from "@/lib/invoices/fee";
import { INVOICE_MERGE_FIELDS } from "@/lib/invoices/merge-fields";

export { INVOICE_MERGE_FIELDS };

export type MergeVars = Record<string, string>;

function money(n?: number, currency = "USD"): string {
  return formatMoney(Number(n) || 0, currency);
}

function num(n?: number): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return String(n);
}

export function invoiceMergeVars(invoice: Invoice): MergeVars {
  const currency = invoice.currency || "USD";
  const first = invoice.line_items?.[0];
  const lines = (invoice.line_items || [])
    .map((li) => li.description)
    .filter(Boolean)
    .join("; ");
  const raw: MergeVars = {
    invoice_number: invoice.invoice_number || "",
    status: (invoice.status || "draft").toUpperCase(),
    issue_date: invoice.issue_date || "",
    due_date: invoice.due_date || "",
    client_name: invoice.client_name || "",
    client_email: invoice.client_email || "",
    client_address: invoice.client_address || "",
    candidate_name: invoice.candidate_name || "",
    job_title: invoice.job_title || "",
    fee_type: invoice.fee_type === "flat" ? "Flat fee" : "% of salary",
    fee_percent: num(invoice.fee_percent),
    fee_flat: invoice.fee_flat != null ? money(invoice.fee_flat, currency) : "",
    salary_basis:
      invoice.salary_basis != null ? money(invoice.salary_basis, currency) : "",
    salary_range: invoice.salary_range_label || "",
    total: money(invoice.total, currency),
    subtotal: money(invoice.subtotal, currency),
    currency,
    notes: invoice.notes || "",
    payment_terms: invoice.payment_terms || "",
    from_name: invoice.from_name || "",
    from_address: invoice.from_address || "",
    from_email: invoice.from_email || "",
    from_phone: invoice.from_phone || "",
    description: first?.description || "",
    line_items: lines,
  };
  const out: MergeVars = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = value;
    out[key.toUpperCase()] = value;
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lookupVar(vars: MergeVars, key: string): string {
  const k = key.trim();
  return vars[k] ?? vars[k.toLowerCase()] ?? vars[k.toUpperCase()] ?? "";
}

/** Replace {{tokens}} even when Word splits them across <w:t> runs. */
export function replacePlaceholdersInXml(
  xml: string,
  vars: MergeVars
): string {
  const simple = xml.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
    escapeXml(lookupVar(vars, key))
  );

  const nodeRe = /<w:t(\b[^>]*)>([\s\S]*?)<\/w:t>/g;
  const parts: {
    fullStart: number;
    fullEnd: number;
    attrs: string;
    text: string;
  }[] = [];
  let match: RegExpExecArray | null;
  while ((match = nodeRe.exec(simple))) {
    parts.push({
      fullStart: match.index,
      fullEnd: match.index + match[0].length,
      attrs: match[1] || "",
      text: match[2] || "",
    });
  }
  if (!parts.length) return simple;

  const joined = parts.map((p) => p.text).join("");
  const tokenRe = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const hits: { start: number; end: number; value: string }[] = [];
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(joined))) {
    hits.push({
      start: token.index,
      end: token.index + token[0].length,
      value: escapeXml(lookupVar(vars, token[1])),
    });
  }
  if (!hits.length) return simple;

  const starts: number[] = [];
  let acc = 0;
  for (const part of parts) {
    starts.push(acc);
    acc += part.text.length;
  }

  const nextText = parts.map((p) => p.text);
  for (const hit of [...hits].reverse()) {
    let placed = false;
    for (let i = 0; i < parts.length; i++) {
      const a = starts[i];
      const b = a + parts[i].text.length;
      if (hit.end <= a || hit.start >= b) continue;
      const from = Math.max(0, hit.start - a);
      const to = Math.min(parts[i].text.length, hit.end - a);
      if (!placed) {
        nextText[i] = nextText[i].slice(0, from) + hit.value + nextText[i].slice(to);
        placed = true;
      } else {
        nextText[i] = nextText[i].slice(0, from) + nextText[i].slice(to);
      }
    }
  }

  let out = simple;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    out =
      out.slice(0, part.fullStart) +
      `<w:t${part.attrs}>${nextText[i]}</w:t>` +
      out.slice(part.fullEnd);
  }
  return out;
}

export async function fillDocxBuffer(
  input: Buffer,
  vars: MergeVars
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  const names = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)
  );
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    zip.file(name, replacePlaceholdersInXml(xml, vars));
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function fillPdfBuffer(
  input: Buffer,
  vars: MergeVars,
  stamp?: string
): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: true });
  try {
    const form = pdf.getForm();
    for (const field of form.getFields()) {
      const name = field.getName();
      const value = lookupVar(vars, name);
      if (!value) continue;
      const anyField = field as {
        setText?: (v: string) => void;
        select?: (v: string) => void;
      };
      try {
        anyField.setText?.(value);
      } catch {
        try {
          anyField.select?.(value);
        } catch {
          /* ignore unmatched field type */
        }
      }
    }
    form.updateFieldAppearances();
  } catch {
    /* no AcroForm */
  }

  if (stamp) {
    const first = pdf.getPages()[0];
    if (first) {
      const { height } = first.getSize();
      first.drawText(stamp.slice(0, 110), {
        x: 36,
        y: height - 16,
        size: 8,
      });
    }
  }

  return Buffer.from(await pdf.save());
}

export function parseGoogleDocId(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const doc = raw.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (doc) return doc[1];
  const drive = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (drive) return drive[1];
  const open = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (open) return open[1];
  return null;
}

export async function exportGoogleDocDocx(url: string): Promise<Buffer> {
  const id = parseGoogleDocId(url);
  if (!id) {
    throw new Error("That does not look like a Google Doc or Drive link.");
  }
  const endpoints = [
    `https://docs.google.com/document/d/${id}/export?format=docx`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ];
  let lastStatus = 0;
  for (const href of endpoints) {
    const res = await fetch(href, {
      redirect: "follow",
      headers: { Accept: "*/*" },
    });
    lastStatus = res.status;
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 80) continue;
    const head = buf.subarray(0, 2).toString("utf8");
    if (head === "PK") return buf;
    const asText = buf.subarray(0, 200).toString("utf8").toLowerCase();
    if (asText.includes("<html") || asText.includes("sign in")) continue;
  }
  if (lastStatus === 401 || lastStatus === 403) {
    throw new Error(
      "Trio cannot open that Google Doc. In Google Docs use Share → Anyone with the link can view (or File → Download → Word and upload the .docx)."
    );
  }
  throw new Error(
    "Could not export that Google Doc. Share it as Anyone with the link can view, or upload a Word/.docx export."
  );
}
