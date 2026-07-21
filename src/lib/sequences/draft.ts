/**
 * Sequence outreach draft helpers.
 * Template rendering + first-touch drafts (offline-capable, no hard AI dependency).
 *
 * @serverOnly
 */

import type { SequenceDefinition, SequenceStep } from '@/lib/schemas/sequence';

export interface TemplateVars {
  candidateName?: string;
  jobTitle?: string;
  companyName?: string;
  recruiterName?: string;
  skills?: string | string[];
}

export interface CandidateLike {
  id?: string;
  name?: string;
  email?: string;
  title?: string;
  summary?: string;
  skills?: string[];
  location?: string;
}

export interface JobLike {
  id?: string;
  title?: string;
  companyName?: string;
  description?: string;
  location?: string;
}

/**
 * Replace {{var}} placeholders in a template string.
 */
export function renderTemplate(
  template: string,
  vars: TemplateVars
): string {
  if (!template) return '';

  const skillsArr = Array.isArray(vars.skills)
    ? vars.skills
    : typeof vars.skills === 'string' && vars.skills
      ? vars.skills.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];

  const skillsList = skillsArr.slice(0, 5).join(', ');
  const skillsPhrase = skillsList ? ` in ${skillsList}` : '';

  const map: Record<string, string> = {
    candidateName: vars.candidateName?.trim() || 'there',
    jobTitle: vars.jobTitle?.trim() || 'this role',
    companyName: vars.companyName?.trim() || 'our company',
    recruiterName: vars.recruiterName?.trim() || 'the recruiting team',
    skills: skillsList,
    skillsPhrase,
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return map[key] !== undefined ? map[key] : '';
  });
}

function defaultFirstTouchEmail(vars: TemplateVars): { subject: string; body: string } {
  const name = vars.candidateName?.trim() || 'there';
  const job = vars.jobTitle?.trim() || 'an open role';
  const company = vars.companyName?.trim() || 'our team';
  const recruiter = vars.recruiterName?.trim() || 'the recruiting team';
  const skillsArr = Array.isArray(vars.skills)
    ? vars.skills
    : typeof vars.skills === 'string' && vars.skills
      ? vars.skills.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
  const skillsBit = skillsArr.length
    ? ` Your experience with ${skillsArr.slice(0, 3).join(', ')} stood out.`
    : '';

  return {
    subject: `Opportunity: ${job} at ${company}`,
    body: [
      `Hi ${name},`,
      '',
      `I hope this note finds you well. I'm reaching out about the ${job} position at ${company}.${skillsBit}`,
      '',
      `I'd love to share more about the role and learn whether it might be a fit. Would you have 15–20 minutes for a quick conversation this week?`,
      '',
      `Looking forward to connecting.`,
      '',
      `Best regards,`,
      recruiter,
    ].join('\n'),
  };
}

/**
 * Build a first-touch draft from a sequence step template, or a professional default.
 */
export function buildFirstTouchDraft(params: {
  candidate: CandidateLike;
  job?: JobLike | null;
  sequence?: SequenceDefinition | null;
  step?: SequenceStep | null;
  recruiterName?: string;
}): { subject: string; body: string; channel: string; stepId?: string } {
  const { candidate, job, sequence, step, recruiterName } = params;

  const vars: TemplateVars = {
    candidateName: candidate.name,
    jobTitle: job?.title,
    companyName: job?.companyName,
    recruiterName: recruiterName || 'Recruiting Team',
    skills: candidate.skills,
  };

  const activeStep =
    step ||
    sequence?.steps?.find((s) => s.channel === 'email') ||
    sequence?.steps?.[0] ||
    null;

  if (activeStep?.channel === 'task' || activeStep?.channel === 'linkedin_task') {
    const title = renderTemplate(
      activeStep.taskTitle || 'Follow up with {{candidateName}}',
      vars
    );
    return {
      subject: title,
      body: title,
      channel: activeStep.channel,
      stepId: activeStep.id,
    };
  }

  if (activeStep?.bodyTemplate || activeStep?.subject) {
    const subject = renderTemplate(
      activeStep.subject || 'Opportunity: {{jobTitle}} at {{companyName}}',
      vars
    );
    const body = activeStep.bodyTemplate
      ? renderTemplate(activeStep.bodyTemplate, vars)
      : defaultFirstTouchEmail(vars).body;
    return {
      subject,
      body,
      channel: activeStep.channel || 'email',
      stepId: activeStep.id,
    };
  }

  const fallback = defaultFirstTouchEmail(vars);
  return {
    ...fallback,
    channel: 'email',
    stepId: activeStep?.id,
  };
}

/**
 * Generate a personalized first draft. Tries a richer template using candidate
 * summary/skills; stays fully offline (no LLM hard dependency).
 */
export async function generateAiFirstDraft(params: {
  candidate: CandidateLike;
  job?: JobLike | null;
  sequence?: SequenceDefinition | null;
  step?: SequenceStep | null;
  recruiterName?: string;
}): Promise<{ subject: string; body: string; source: 'template' | 'personalized' }> {
  const base = buildFirstTouchDraft(params);
  const { candidate, job, recruiterName } = params;

  // If step already had a body template, prefer rendered template
  if (params.step?.bodyTemplate || params.sequence?.steps?.[0]?.bodyTemplate) {
    return { subject: base.subject, body: base.body, source: 'template' };
  }

  // Personalized offline draft using summary / skills / title
  const name = candidate.name?.trim() || 'there';
  const jobTitle = job?.title?.trim() || 'an open role';
  const company = job?.companyName?.trim() || 'our company';
  const recruiter = recruiterName?.trim() || 'Recruiting Team';
  const skills = (candidate.skills || []).filter(Boolean).slice(0, 5);
  const title = candidate.title?.trim();
  const summary = (candidate.summary || '').trim().slice(0, 280);
  const location = candidate.location?.trim();

  const hookParts: string[] = [];
  if (title) hookParts.push(`your work as ${title}`);
  if (skills.length) hookParts.push(`your experience with ${skills.join(', ')}`);
  if (location) hookParts.push(`your background in ${location}`);
  const hook =
    hookParts.length > 0
      ? `I was particularly interested in ${hookParts.slice(0, 2).join(' and ')}.`
      : 'Your background looks like a strong match for what we are hiring for.';

  const summaryLine = summary
    ? `\n\nFrom what I can see — ${summary}${summary.length >= 280 ? '…' : ''} — this could be a great next step.`
    : '';

  const body = [
    `Hi ${name},`,
    '',
    `I hope you're doing well. I'm reaching out about the ${jobTitle} role at ${company}. ${hook}${summaryLine}`,
    '',
    `Would you be open to a short intro call this week? Happy to share more detail and hear what you're looking for next.`,
    '',
    `Best,`,
    recruiter,
  ].join('\n');

  return {
    subject: `Quick intro — ${jobTitle} at ${company}`,
    body,
    source: 'personalized',
  };
}
