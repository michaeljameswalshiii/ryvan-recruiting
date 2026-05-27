import { z } from 'zod';

/**
 * Client Schema
 * Validation schema for client/company data
 */

// Pipeline stages for companies (same as candidates)
const companyStageValues = [
  'identification',
  'outreach', 
  'conversation',
  'presented',
  'meeting',
  'proposal',
  'closed_won',
  'lost'
] as const;

export const clientSchema = z.object({
  id: z.string().uuid().optional(),
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
});

// Export company stages constant for use in UI (rename to avoid conflict)
export const companyStageOptions = [
  { id: 'identification', label: 'Identification', color: 'bg-blue-500' },
  { id: 'outreach', label: 'Outreach', color: 'bg-yellow-500' },
  { id: 'conversation', label: 'Conversation', color: 'bg-purple-500' },
  { id: 'presented', label: 'Presented', color: 'bg-indigo-500' },
  { id: 'meeting', label: 'Meeting', color: 'bg-orange-500' },
  { id: 'proposal', label: 'Proposal', color: 'bg-pink-500' },
  { id: 'closed_won', label: 'Closed Won', color: 'bg-green-500' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500' },
] as const;

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
