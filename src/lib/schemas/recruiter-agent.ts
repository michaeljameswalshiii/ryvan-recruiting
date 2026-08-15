import { z } from 'zod';

export const recruiterAgentConfigSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('recruiter_agent_config'),
  enabled: z.boolean(),
  paused: z.boolean(),
  minFitScore: z.number().int().min(0).max(100),
  reviewFitScore: z.number().int().min(0).max(100),
  maxCandidatesPerRun: z.number().int().min(1).max(500),
  maxRunsPerDay: z.number().int().min(1).max(1000),
  dailyBudgetUsd: z.number().min(0).max(10000),
  monthlyBudgetUsd: z.number().min(0).max(100000),
  updatedAt: z.string(),
  updatedBy: z.string().optional(),
  createdAt: z.string(),
});

export type RecruiterAgentConfig = z.infer<typeof recruiterAgentConfigSchema>;

export const updateRecruiterAgentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  minFitScore: z.number().int().min(0).max(100).optional(),
  reviewFitScore: z.number().int().min(0).max(100).optional(),
  maxCandidatesPerRun: z.number().int().min(1).max(500).optional(),
  maxRunsPerDay: z.number().int().min(1).max(1000).optional(),
  dailyBudgetUsd: z.number().min(0).max(10000).optional(),
  monthlyBudgetUsd: z.number().min(0).max(100000).optional(),
});

export type UpdateRecruiterAgentConfig = z.infer<
  typeof updateRecruiterAgentConfigSchema
>;

export const RECRUITER_AGENT_DEFAULTS = {
  enabled: true,
  paused: false,
  minFitScore: 80,
  reviewFitScore: 65,
  maxCandidatesPerRun: 500,
  maxRunsPerDay: 5,
  dailyBudgetUsd: 5,
  monthlyBudgetUsd: 100,
} as const;
