/**
 * Placement invoice + invoice template schemas
 */

import { z } from "zod";

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const FEE_TYPES = ["percent", "flat"] as const;
export type FeeType = (typeof FEE_TYPES)[number];

export const INVOICE_SOURCE_KINDS = [
  "built_in",
  "google_doc",
  "docx",
  "pdf",
] as const;
export type InvoiceSourceKind = (typeof INVOICE_SOURCE_KINDS)[number];

export const invoiceSourceFields = {
  source_kind: z.enum(INVOICE_SOURCE_KINDS).optional(),
  source_url: z.string().max(2000).optional().nullable(),
  source_file_key: z.string().max(500).optional().nullable(),
  source_file_name: z.string().max(260).optional().nullable(),
  source_file_type: z.string().max(120).optional().nullable(),
};

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0).default(1),
  unit_amount: z.number().min(0),
  amount: z.number().min(0),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const invoiceTemplateSchema = z.object({
  tenant_id: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100),
  is_default: z.boolean().optional(),
  /** Override org logo; empty/null = use tenant logo_url */
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().optional(),
  header_text: z.string().max(500).optional(),
  footer_text: z.string().max(2000).optional(),
  payment_terms: z.string().max(2000).optional(),
  from_name: z.string().max(200).optional(),
  from_address: z.string().max(500).optional(),
  from_email: z.string().max(200).optional(),
  from_phone: z.string().max(50).optional(),
  default_fee_type: z.enum(FEE_TYPES).optional(),
  default_fee_percent: z.number().min(0).max(100).optional(),
  default_fee_flat: z.number().min(0).optional(),
  ...invoiceSourceFields,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type InvoiceTemplate = z.infer<typeof invoiceTemplateSchema>;

export const createInvoiceTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  is_default: z.boolean().optional(),
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().optional(),
  header_text: z.string().max(500).optional(),
  footer_text: z.string().max(2000).optional(),
  payment_terms: z.string().max(2000).optional(),
  from_name: z.string().max(200).optional(),
  from_address: z.string().max(500).optional(),
  from_email: z.string().max(200).optional(),
  from_phone: z.string().max(50).optional(),
  default_fee_type: z.enum(FEE_TYPES).optional(),
  default_fee_percent: z.number().min(0).max(100).optional(),
  default_fee_flat: z.number().min(0).optional(),
  ...invoiceSourceFields,
});

export type CreateInvoiceTemplateInput = z.infer<
  typeof createInvoiceTemplateSchema
>;

export const updateInvoiceTemplateSchema = createInvoiceTemplateSchema.partial();
export type UpdateInvoiceTemplateInput = z.infer<
  typeof updateInvoiceTemplateSchema
>;

export const invoiceSchema = z.object({
  tenant_id: z.string(),
  id: z.string(),
  invoice_number: z.string(),
  status: z.enum(INVOICE_STATUSES),
  job_id: z.string().optional(),
  job_title: z.string().optional(),
  client_id: z.string().optional(),
  client_name: z.string(),
  client_email: z.string().optional(),
  client_address: z.string().optional(),
  candidate_id: z.string().optional(),
  candidate_name: z.string().optional(),
  template_id: z.string().optional(),
  template_name: z.string().optional(),
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().optional(),
  header_text: z.string().optional(),
  footer_text: z.string().optional(),
  payment_terms: z.string().optional(),
  from_name: z.string().optional(),
  from_address: z.string().optional(),
  from_email: z.string().optional(),
  from_phone: z.string().optional(),
  fee_type: z.enum(FEE_TYPES),
  fee_percent: z.number().optional(),
  fee_flat: z.number().optional(),
  salary_basis: z.number().optional(),
  salary_range_label: z.string().optional(),
  line_items: z.array(invoiceLineItemSchema),
  subtotal: z.number(),
  total: z.number(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
  issue_date: z.string(),
  due_date: z.string().optional(),
  created_by: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  sent_at: z.string().optional(),
  paid_at: z.string().optional(),
  voided_at: z.string().optional(),
  ...invoiceSourceFields,
});

export type Invoice = z.infer<typeof invoiceSchema>;

export const createInvoiceSchema = z.object({
  job_id: z.string().optional(),
  client_name: z.string().min(1).max(200),
  client_email: z.string().email().optional().or(z.literal("")),
  client_address: z.string().max(500).optional(),
  client_id: z.string().optional(),
  candidate_id: z.string().optional(),
  candidate_name: z.string().max(200).optional(),
  template_id: z.string().optional(),
  fee_type: z.enum(FEE_TYPES).default("percent"),
  fee_percent: z.number().min(0).max(100).optional(),
  fee_flat: z.number().min(0).optional(),
  salary_basis: z.number().min(0).optional(),
  salary_range_label: z.string().optional(),
  line_items: z.array(invoiceLineItemSchema).optional(),
  notes: z.string().max(2000).optional(),
  due_days: z.number().min(0).max(365).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  client_name: z.string().min(1).max(200).optional(),
  client_email: z.string().optional(),
  client_address: z.string().optional(),
  line_items: z.array(invoiceLineItemSchema).optional(),
  fee_type: z.enum(FEE_TYPES).optional(),
  fee_percent: z.number().min(0).max(100).optional(),
  fee_flat: z.number().min(0).optional(),
  salary_basis: z.number().min(0).optional(),
  due_date: z.string().optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
