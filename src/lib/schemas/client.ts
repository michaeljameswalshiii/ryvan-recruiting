import { z } from 'zod';

/**
 * Client Schema
 * Validation schema for client/company data
 */

// Pipeline stages for companies (BD + account status)
// Keep legacy `presented` in the enum so old records still validate;
// UI options use Proposal instead (same meaning).
const companyStageValues = [
  'identification',
  'outreach',
  'conversation',
  'presented', // legacy — prefer `proposal`
  'meeting',
  'proposal',
  'closed_won',
  'client',
  'known_user',
  'dnu',
  'lost',
] as const;

// -----------------------------------------------------------------------------
// Contact Phone Schema
// -----------------------------------------------------------------------------

export const contactPhoneSchema = z.object({
  id: z.string(),
  type: z.string().max(20).optional().or(z.literal('')),
  number: z.string().max(20).optional().or(z.literal('')),
  isPreferred: z.boolean().default(false),
});

export type ContactPhone = z.infer<typeof contactPhoneSchema>;

// -----------------------------------------------------------------------------
// Contact Schema
// -----------------------------------------------------------------------------

export const contactSchema = z.object({
  id: z.string(),
  companyId: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  title: z.string().max(100).optional().or(z.literal('')),
// Email: optional, allow empty or valid email
  email: z.string().optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  // Multi-phone support
  phones: z.array(contactPhoneSchema).optional(),
  // Flattened preferred phone fields (auto-populated from phones array)
  preferredPhone: z.string().max(20).optional().or(z.literal('')),
  preferredPhoneType: z.string().max(20).optional().or(z.literal('')),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(500).optional().or(z.literal('')),
  /** Personal LinkedIn profile URL (same idea as candidates) */
  linkedin_url: z.string().max(300).optional().or(z.literal('')),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Contact = z.infer<typeof contactSchema>;

// Create input (without id - generated on server)
export const createContactSchema = contactSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  isPrimary: true,
  preferredPhone: true,
  preferredPhoneType: true,
}).extend({
  isPrimary: z.boolean().default(false),
  // phones is optional, but if provided should be an array
  phones: z.array(contactPhoneSchema).optional(),
});

// Update input (all fields optional)
export const updateContactSchema = contactSchema.partial().omit({ id: true });

// Type exports for Contact inputs
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// -----------------------------------------------------------------------------
// Client Schema
// -----------------------------------------------------------------------------

export const clientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().optional().or(z.literal('')),
  domain: z.string().max(100).optional().or(z.literal('')),
  industry: z.string().max(50).optional().or(z.literal('')),
  city: z.string().max(50).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  country: z.string().max(50).optional().or(z.literal('')),
  employee_count: z.number().int().positive().optional(),
  revenue: z.string().max(50).optional().or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
  linkedin_url: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  // Pipeline status field
  status: z.enum(companyStageValues).optional(),
  // Multiple contacts support
  contacts: z.array(contactSchema).optional(),
  // Primary contact (denormalized for quick access - first primary or first in list)
  primaryContactId: z.string().optional(),
});

// Export company stages constant for use in UI (rename to avoid conflict)
export const companyStageOptions = [
  { id: 'identification', label: 'Identification', color: 'bg-blue-500' },
  { id: 'outreach', label: 'Outreach', color: 'bg-yellow-500' },
  { id: 'conversation', label: 'Conversation', color: 'bg-purple-500' },
  { id: 'meeting', label: 'Meeting', color: 'bg-orange-500' },
  { id: 'proposal', label: 'Proposal', color: 'bg-pink-500' },
  { id: 'closed_won', label: 'Closed Won', color: 'bg-green-500' },
  { id: 'client', label: 'Client', color: 'bg-emerald-600' },
  { id: 'known_user', label: 'Known User', color: 'bg-sky-500' },
  { id: 'dnu', label: 'DNU', color: 'bg-slate-500' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500' },
] as const;

/** Normalize legacy company stage values for forms / display */
export function normalizeCompanyStage(status?: string | null): string {
  if (!status) return 'identification';
  const s = String(status).trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'presented' || s === 'candidate_presented') return 'proposal';
  if (s === 'won' || s === 'active') return 'closed_won';
  if (s === 'do_not_use' || s === 'donotuse') return 'dnu';
  if (s === 'knownuser' || s === 'known') return 'known_user';
  return s;
}

export function companyStageLabel(status?: string | null): string {
  const key = normalizeCompanyStage(status);
  const found = companyStageOptions.find((o) => o.id === key);
  if (found) return found.label;
  if (key === 'presented') return 'Proposal';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Also export as companyStages for backward compatibility
export { companyStageOptions as companyStages };

// Create input (without id - generated on server)
export const createClientSchema = clientSchema.omit({ id: true });

// Update input (all fields optional)
export const updateClientSchema = clientSchema.partial();

// Query params schema
export const clientQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Type exports
export type Client = z.infer<typeof clientSchema> & {
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
};
export type CreateClientInput = Omit<z.infer<typeof clientSchema>, 'id'> & {
  tenant_id?: string;
};
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
