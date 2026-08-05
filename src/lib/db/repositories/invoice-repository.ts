/**
 * Invoice + invoice template repository
 * @serverOnly
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type {
  Invoice,
  InvoiceTemplate,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  CreateInvoiceTemplateInput,
  UpdateInvoiceTemplateInput,
  InvoiceLineItem,
  InvoiceStatus,
} from "@/lib/schemas/invoice";
import { computePlacementFee } from "@/lib/invoices/fee";

const region = process.env.AWS_REGION || "us-east-1";
const dynamo = new DynamoDBClient({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const invoicesTable =
  process.env.DYNAMODB_INVOICES_TABLE || "turnkey-invoices";
const templatesTable =
  process.env.DYNAMODB_INVOICE_TEMPLATES_TABLE || "turnkey-invoice-templates";
const tenantsTable =
  process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Next invoice number: INV-YYYY-0001 (per tenant) */
export async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const res = await dynamo.send(
      new UpdateItemCommand({
        TableName: tenantsTable,
        Key: marshall({ id: tenantId }),
        UpdateExpression:
          "SET invoice_seq = if_not_exists(invoice_seq, :z) + :one, invoice_seq_year = :y",
        ExpressionAttributeValues: marshall({
          ":z": 0,
          ":one": 1,
          ":y": year,
        }),
        ReturnValues: "ALL_NEW",
      })
    );
    const tenant = res.Attributes
      ? (unmarshall(res.Attributes) as { invoice_seq?: number; invoice_seq_year?: number })
      : {};
    // Reset seq when year rolls (best-effort)
    let seq = Number(tenant.invoice_seq) || 1;
    if (tenant.invoice_seq_year && tenant.invoice_seq_year !== year) {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tenantsTable,
          Key: marshall({ id: tenantId }),
          UpdateExpression: "SET invoice_seq = :one, invoice_seq_year = :y",
          ExpressionAttributeValues: marshall({ ":one": 1, ":y": year }),
          ReturnValues: "ALL_NEW",
        })
      );
      seq = 1;
    }
    return `INV-${year}-${String(seq).padStart(4, "0")}`;
  } catch (err) {
    console.error("[invoice] nextInvoiceNumber failed, using fallback", err);
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listInvoiceTemplates(
  tenantId: string
): Promise<InvoiceTemplate[]> {
  try {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: templatesTable,
        KeyConditionExpression: "tenant_id = :t",
        ExpressionAttributeValues: marshall({ ":t": tenantId }),
      })
    );
    return (res.Items || []).map((i) => unmarshall(i) as InvoiceTemplate);
  } catch (err) {
    console.error("[invoice] list templates", err);
    return [];
  }
}

export async function getInvoiceTemplate(
  tenantId: string,
  id: string
): Promise<InvoiceTemplate | null> {
  try {
    const res = await dynamo.send(
      new GetItemCommand({
        TableName: templatesTable,
        Key: marshall({ tenant_id: tenantId, id }),
      })
    );
    return res.Item ? (unmarshall(res.Item) as InvoiceTemplate) : null;
  } catch {
    return null;
  }
}

export async function getDefaultInvoiceTemplate(
  tenantId: string
): Promise<InvoiceTemplate | null> {
  const all = await listInvoiceTemplates(tenantId);
  return all.find((t) => t.is_default) || all[0] || null;
}

export async function createInvoiceTemplate(
  tenantId: string,
  input: CreateInvoiceTemplateInput
): Promise<InvoiceTemplate> {
  const now = new Date().toISOString();
  const tpl: InvoiceTemplate = {
    tenant_id: tenantId,
    id: `tpl-${uuid()}`,
    name: input.name,
    is_default: input.is_default ?? false,
    logo_url: input.logo_url ?? null,
    primary_color: input.primary_color || "#2563eb",
    header_text: input.header_text || "INVOICE",
    footer_text: input.footer_text || "Thank you for your business.",
    payment_terms:
      input.payment_terms ||
      "Payment due within 30 days of invoice date. Please include invoice number with payment.",
    from_name: input.from_name || "",
    from_address: input.from_address || "",
    from_email: input.from_email || "",
    from_phone: input.from_phone || "",
    default_fee_type: input.default_fee_type || "percent",
    default_fee_percent: input.default_fee_percent ?? 20,
    default_fee_flat: input.default_fee_flat,
    created_at: now,
    updated_at: now,
  };

  if (tpl.is_default) {
    await clearDefaultFlags(tenantId);
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: templatesTable,
      Item: marshall(tpl, { removeUndefinedValues: true }),
    })
  );
  return tpl;
}

async function clearDefaultFlags(tenantId: string) {
  const all = await listInvoiceTemplates(tenantId);
  for (const t of all) {
    if (!t.is_default) continue;
    await dynamo.send(
      new UpdateItemCommand({
        TableName: templatesTable,
        Key: marshall({ tenant_id: tenantId, id: t.id }),
        UpdateExpression: "SET is_default = :f, updated_at = :u",
        ExpressionAttributeValues: marshall({
          ":f": false,
          ":u": new Date().toISOString(),
        }),
      })
    );
  }
}

export async function updateInvoiceTemplate(
  tenantId: string,
  id: string,
  input: UpdateInvoiceTemplateInput
): Promise<InvoiceTemplate | null> {
  const existing = await getInvoiceTemplate(tenantId, id);
  if (!existing) return null;

  if (input.is_default === true) {
    await clearDefaultFlags(tenantId);
  }

  const next: InvoiceTemplate = {
    ...existing,
    ...input,
    logo_url:
      input.logo_url !== undefined ? input.logo_url : existing.logo_url,
    updated_at: new Date().toISOString(),
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: templatesTable,
      Item: marshall(next, { removeUndefinedValues: true }),
    })
  );
  return next;
}

export async function deleteInvoiceTemplate(
  tenantId: string,
  id: string
): Promise<boolean> {
  try {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: templatesTable,
        Key: marshall({ tenant_id: tenantId, id }),
      })
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export async function listInvoices(tenantId: string): Promise<Invoice[]> {
  try {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: invoicesTable,
        KeyConditionExpression: "tenant_id = :t",
        ExpressionAttributeValues: marshall({ ":t": tenantId }),
      })
    );
    const items = (res.Items || []).map((i) => unmarshall(i) as Invoice);
    return items.sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    );
  } catch (err) {
    console.error("[invoice] list", err);
    return [];
  }
}

export async function getInvoice(
  tenantId: string,
  id: string
): Promise<Invoice | null> {
  try {
    const res = await dynamo.send(
      new GetItemCommand({
        TableName: invoicesTable,
        Key: marshall({ tenant_id: tenantId, id }),
      })
    );
    return res.Item ? (unmarshall(res.Item) as Invoice) : null;
  } catch {
    return null;
  }
}

export async function createInvoice(
  tenantId: string,
  input: CreateInvoiceInput,
  opts: {
    createdBy?: string;
    jobTitle?: string;
    template?: InvoiceTemplate | null;
    orgLogoUrl?: string | null;
    orgName?: string;
    orgPrimaryColor?: string;
  } = {}
): Promise<Invoice> {
  const now = new Date().toISOString();
  const invoiceNumber = await nextInvoiceNumber(tenantId);
  const tpl = opts.template;

  const feeType = input.fee_type || tpl?.default_fee_type || "percent";
  const feePercent =
    input.fee_percent ?? tpl?.default_fee_percent ?? 20;
  const feeFlat = input.fee_flat ?? tpl?.default_fee_flat;
  const salaryBasis = input.salary_basis;

  let lineItems: InvoiceLineItem[] = input.line_items || [];
  if (!lineItems.length) {
    const fee = computePlacementFee({
      feeType,
      feePercent,
      feeFlat,
      salaryBasis,
    });
    const jobBit = opts.jobTitle || input.job_id ? opts.jobTitle || "" : "";
    const candBit = input.candidate_name
      ? ` — ${input.candidate_name}`
      : "";
    lineItems = [
      {
        description: `${fee.description}${jobBit ? ` · ${jobBit}` : ""}${candBit}`,
        quantity: 1,
        unit_amount: fee.amount,
        amount: fee.amount,
      },
    ];
  }

  const subtotal = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const dueDays = input.due_days ?? 30;
  const due = new Date();
  due.setDate(due.getDate() + dueDays);

  const logo =
    tpl?.logo_url || opts.orgLogoUrl || null;
  const color =
    tpl?.primary_color || opts.orgPrimaryColor || "#2563eb";

  const invoice: Invoice = {
    tenant_id: tenantId,
    id: `inv-${uuid()}`,
    invoice_number: invoiceNumber,
    status: input.status || "draft",
    job_id: input.job_id,
    job_title: opts.jobTitle,
    client_id: input.client_id,
    client_name: input.client_name,
    client_email: input.client_email || undefined,
    client_address: input.client_address,
    candidate_id: input.candidate_id,
    candidate_name: input.candidate_name,
    template_id: tpl?.id,
    template_name: tpl?.name,
    logo_url: logo,
    primary_color: color,
    header_text: tpl?.header_text || "INVOICE",
    footer_text: tpl?.footer_text || "Thank you for your business.",
    payment_terms:
      tpl?.payment_terms ||
      "Payment due within 30 days of invoice date.",
    from_name: tpl?.from_name || opts.orgName || "",
    from_address: tpl?.from_address || "",
    from_email: tpl?.from_email || "",
    from_phone: tpl?.from_phone || "",
    fee_type: feeType,
    fee_percent: feeType === "percent" ? feePercent : undefined,
    fee_flat: feeType === "flat" ? feeFlat : undefined,
    salary_basis: salaryBasis,
    salary_range_label: input.salary_range_label,
    line_items: lineItems,
    subtotal,
    total: subtotal,
    currency: "USD",
    notes: input.notes,
    issue_date: now.slice(0, 10),
    due_date: due.toISOString().slice(0, 10),
    created_by: opts.createdBy,
    created_at: now,
    updated_at: now,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: invoicesTable,
      Item: marshall(invoice, { removeUndefinedValues: true }),
    })
  );
  return invoice;
}

export async function updateInvoice(
  tenantId: string,
  id: string,
  input: UpdateInvoiceInput
): Promise<Invoice | null> {
  const existing = await getInvoice(tenantId, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  let lineItems = input.line_items ?? existing.line_items;
  let feeType = input.fee_type ?? existing.fee_type;
  let feePercent = input.fee_percent ?? existing.fee_percent;
  let feeFlat = input.fee_flat ?? existing.fee_flat;
  let salaryBasis = input.salary_basis ?? existing.salary_basis;

  // Recompute default line if fee fields change and no custom line_items passed
  if (
    (input.fee_type ||
      input.fee_percent != null ||
      input.fee_flat != null ||
      input.salary_basis != null) &&
    !input.line_items
  ) {
    const fee = computePlacementFee({
      feeType,
      feePercent,
      feeFlat,
      salaryBasis,
    });
    lineItems = [
      {
        description: `${fee.description}${
          existing.job_title ? ` · ${existing.job_title}` : ""
        }${existing.candidate_name ? ` — ${existing.candidate_name}` : ""}`,
        quantity: 1,
        unit_amount: fee.amount,
        amount: fee.amount,
      },
    ];
  }

  const subtotal = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const status: InvoiceStatus = input.status || existing.status;

  const next: Invoice = {
    ...existing,
    ...input,
    fee_type: feeType,
    fee_percent: feePercent,
    fee_flat: feeFlat,
    salary_basis: salaryBasis,
    line_items: lineItems,
    subtotal,
    total: subtotal,
    status,
    updated_at: now,
    sent_at:
      status === "sent" && !existing.sent_at ? now : existing.sent_at,
    paid_at:
      status === "paid" && !existing.paid_at ? now : existing.paid_at,
    voided_at:
      status === "void" && !existing.voided_at ? now : existing.voided_at,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: invoicesTable,
      Item: marshall(next, { removeUndefinedValues: true }),
    })
  );
  return next;
}
