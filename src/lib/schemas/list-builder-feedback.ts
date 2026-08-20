/**
 * Recruiter preference memory for the company list-builder.
 *
 * Not model fine-tuning. Explicit accept / reject / revise labels only.
 * Viewing a list or leaving rows unlabeled writes nothing.
 */

export const LIST_BUILDER_FEEDBACK_ACTIONS = [
  'accept',
  'reject',
  'revise',
] as const;

export type ListBuilderFeedbackAction =
  (typeof LIST_BUILDER_FEEDBACK_ACTIONS)[number];

export type ListBuilderFeedbackExample = {
  companyName: string;
  industry?: string;
  city?: string;
  state?: string;
};

export type ListBuilderFeedbackEvent = {
  id: string;
  action: ListBuilderFeedbackAction;
  jobId: string;
  userId: string;
  brief: string;
  geography?: string;
  industry?: string;
  /** Preferred brief when action is revise */
  revisedBrief?: string;
  reason?: string;
  examples: ListBuilderFeedbackExample[];
  createdAt: string;
};

export type ListBuilderFeedbackStore = {
  id: string;
  tenant_id: string;
  userId: string;
  type: 'list_builder_feedback';
  events: ListBuilderFeedbackEvent[];
  updatedAt: string;
};

export const LIST_BUILDER_FEEDBACK_MAX_EVENTS = 80;
