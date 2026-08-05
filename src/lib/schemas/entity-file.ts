/**
 * Entity files — attachments on candidates, companies, contacts, and jobs.
 * Binary in S3; metadata in profiles table (same pattern as SMS / list-builder).
 */

import { z } from 'zod';

export const ENTITY_FILE_TYPES = [
  'candidate',
  'company',
  'contact',
  'job',
] as const;

export type EntityFileType = (typeof ENTITY_FILE_TYPES)[number];

export const entityFileTypeSchema = z.enum(ENTITY_FILE_TYPES);

export const entityFileSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('entity_file').default('entity_file'),
  entityType: entityFileTypeSchema,
  entityId: z.string(),
  /** Optional parent company when entity is a contact */
  companyId: z.string().optional(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(120).default('application/octet-stream'),
  sizeBytes: z.number().int().min(0),
  /** S3 object key (preferred) */
  s3Key: z.string().optional(),
  /** data: URL fallback for small files when S3 unavailable */
  dataUrl: z.string().optional(),
  /** Optional user label / description */
  label: z.string().max(200).optional(),
  uploadedBy: z.string().optional(),
  uploadedByEmail: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EntityFile = z.infer<typeof entityFileSchema>;

/** Client-safe view (presigned download URL, no dataUrl blob in lists) */
export type EntityFileView = {
  id: string;
  entityType: EntityFileType;
  entityId: string;
  companyId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  label?: string;
  uploadedBy?: string;
  uploadedByEmail?: string;
  createdAt: string;
  /** Short-lived download URL */
  downloadUrl?: string;
  storage: 's3' | 'inline';
};
