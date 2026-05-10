import { z } from 'zod';

/**
 * Authentication Schema
 * Validation schemas for auth actions
 */

// Login input
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Register input
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password too long'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name is required').max(100),
  tenantName: z.string().min(2, 'Company/team name is required').max(100),
  subdomain: z.string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Change password input
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, 'Current password is required'),
  newPassword: z.string()
    .min(6, 'New password must be at least 6 characters')
    .max(100),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
