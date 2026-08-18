/**
 * Agent Desk — shared types for multi-step agent runs (client + server).
 */

export type AgentRunStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'awaiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentArtifactKind =
  | 'company'
  | 'contact'
  | 'candidate'
  | 'job'
  | 'list_builder'
  | 'apollo_hit'
  | 'note'
  | 'error'
  | 'other';

export type AgentArtifact = {
  id: string;
  kind: AgentArtifactKind;
  title: string;
  subtitle?: string;
  href?: string;
  meta?: Record<string, unknown>;
  at: string;
};

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export type AgentStep = {
  id: string;
  index: number;
  title: string;
  detail?: string;
  status: AgentStepStatus;
  toolsUsed?: string[];
  at: string;
};

export type AgentRunVisibility = 'private' | 'public';

export type AgentRunSnapshot = {
  id: string;
  goal: string;
  status: AgentRunStatus;
  /** User approved CRM writes for the rest of this run */
  writeApproved: boolean;
  wave: number;
  maxWaves: number;
  steps: AgentStep[];
  artifacts: AgentArtifact[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastAssistantText?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** private = only owner; public = whole tenant can open in Goal agent history */
  visibility?: AgentRunVisibility;
  /** Server-persisted (shareable) */
  persisted?: boolean;
  isOwner?: boolean;
  ownerLabel?: string;
  userId?: string;
};

export function newAgentId(prefix = 'run'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAgentRun(
  goal: string,
  opts?: { visibility?: AgentRunVisibility }
): AgentRunSnapshot {
  const now = new Date().toISOString();
  return {
    id: newAgentId('run'),
    goal: goal.trim(),
    status: 'idle',
    writeApproved: false,
    wave: 0,
    maxWaves: 8,
    steps: [],
    artifacts: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
    visibility: opts?.visibility === 'public' ? 'public' : 'private',
    isOwner: true,
    persisted: false,
  };
}

/** Parse tool result JSON strings into artifacts for the results rail */
export function artifactsFromToolPayload(
  toolName: string,
  content: string
): AgentArtifact[] {
  const now = new Date().toISOString();
  const out: AgentArtifact[] = [];
  const push = (a: Omit<AgentArtifact, 'at' | 'id'> & { id?: string }) => {
    out.push({
      id: a.id || newAgentId('art'),
      kind: a.kind,
      title: a.title,
      subtitle: a.subtitle,
      href: a.href,
      meta: a.meta,
      at: now,
    });
  };

  let data: unknown = null;
  try {
    data = JSON.parse(content);
  } catch {
    // plain text tool result
    if (/created|updated|linked/i.test(content) && content.length < 500) {
      push({
        kind: 'note',
        title: toolName,
        subtitle: content.slice(0, 200),
        meta: { tool: toolName },
      });
    }
    return out;
  }

  const root = data as Record<string, unknown>;
  // Nested { data: { ... } } or flat
  const d = (root.data && typeof root.data === 'object'
    ? root.data
    : root) as Record<string, unknown>;

  if (
    toolName === 'start_list_builder' ||
    toolName === 'list_builder_status' ||
    toolName === 'list_builder_control'
  ) {
    const job = (d.job && typeof d.job === 'object' ? d.job : d) as Record<
      string,
      unknown
    >;
    const id = String(job.id || d.id || '');
    const found = job.found ?? job.results;
    const foundN = Array.isArray(found) ? found.length : Number(found || 0);
    const target = job.targetSize || job.target || '';
    const status = String(job.status || d.status || 'running');
    push({
      id: id || undefined,
      kind: 'list_builder',
      title:
        status === 'started' || status === 'running' || status === 'queued'
          ? 'List builder running'
          : `List builder · ${status}`,
      subtitle: [
        Number.isFinite(foundN) ? `${foundN} found` : null,
        target ? `target ${target}` : null,
        job.geography ? String(job.geography) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: id ? `/dashboard/list-builder/${id}` : '/dashboard/ai-assistant',
      meta: { tool: toolName, id, status },
    });
  }

  if (d.status === 'needs_confirmation') {
    push({
      kind: 'note',
      title: 'Needs approval',
      subtitle: String(d.action || toolName),
      meta: { preview: d.preview, tool: toolName },
    });
    return out;
  }

  if (
    toolName === 'create_company' ||
    toolName === 'update_company' ||
    toolName === 'create_company_with_primary_contact'
  ) {
    const company = (d.company || d) as Record<string, unknown>;
    const id = String(company.id || d.id || '');
    const name = String(company.name || d.name || 'Company');
    if (id || name) {
      push({
        id: id || undefined,
        kind: 'company',
        title: name,
        subtitle: d.status ? String(d.status) : toolName,
        href: id ? `/dashboard/companies/${id}` : undefined,
        meta: { tool: toolName, id },
      });
    }
  }

  if (
    toolName === 'create_contact' ||
    toolName === 'update_contact' ||
    toolName === 'create_company_with_primary_contact'
  ) {
    const nested = d.primary_contact as Record<string, unknown> | undefined;
    const c = (nested?.contact || d.contact || (nested && !d.contact ? nested : d)) as Record<string, unknown>;
    const id = String(c.id || d.id || '');
    const name = String(c.name || c.fullName || 'Contact');
    push({
      id: id || undefined,
      kind: 'contact',
      title: name,
      subtitle: String(c.email || c.title || d.status || toolName),
      href: id ? `/dashboard/contact-info/${id}` : undefined,
      meta: { tool: toolName, id },
    });
  }

  if (toolName === 'create_candidate' || toolName === 'update_candidate') {
    const c = (d.candidate || d.lead || d) as Record<string, unknown>;
    const id = String(c.id || d.id || '');
    const name = String(c.name || 'Candidate');
    push({
      id: id || undefined,
      kind: 'candidate',
      title: name,
      subtitle: String(c.title || d.status || toolName),
      href: id ? `/dashboard/candidates/${id}` : undefined,
      meta: { tool: toolName, id },
    });
  }

  if (toolName === 'create_job' || toolName === 'update_job') {
    const j = (d.job || d) as Record<string, unknown>;
    const id = String(j.id || d.id || '');
    const title = String(j.title || 'Job');
    push({
      id: id || undefined,
      kind: 'job',
      title,
      subtitle: String(j.companyName || d.status || toolName),
      href: id ? `/dashboard/jobs/${id}` : undefined,
      meta: { tool: toolName, id },
    });
  }

  // Apollo / search results arrays
  const people = (d.people || d.candidates || d.results) as unknown;
  if (Array.isArray(people)) {
    for (const p of people.slice(0, 25)) {
      const row = p as Record<string, unknown>;
      push({
        kind: 'apollo_hit',
        title: String(row.name || row.full_name || 'Person'),
        subtitle: [row.title, row.company, row.organization_name]
          .filter(Boolean)
          .map(String)
          .join(' · '),
        meta: { tool: toolName, raw: row },
      });
    }
  }

  const companies = (d.companies || d.organizations) as unknown;
  if (Array.isArray(companies) && toolName.includes('apollo')) {
    for (const c of companies.slice(0, 25)) {
      const row = c as Record<string, unknown>;
      push({
        kind: 'apollo_hit',
        title: String(row.name || row.company || 'Company'),
        subtitle: [row.industry, row.city, row.state].filter(Boolean).map(String).join(' · '),
        meta: { tool: toolName, raw: row },
      });
    }
  }

  if (d.status === 'created' || d.status === 'updated' || d.status === 'linked') {
    if (out.length === 0) {
      push({
        kind: 'note',
        title: `${toolName}: ${d.status}`,
        subtitle: String(d.message || '').slice(0, 200) || undefined,
        meta: { tool: toolName, ...d },
      });
    }
  }

  if (root.success === false || d.error) {
    push({
      kind: 'error',
      title: `${toolName} failed`,
      subtitle: String(root.error || d.error || 'Unknown error').slice(0, 240),
      meta: { tool: toolName },
    });
  }

  return out;
}

/** Heuristic: does the assistant text suggest more work remains? */
export function assistantSuggestsMoreWork(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return false;
  if (
    /all (done|complete|created|finished)|goal (is )?(complete|done)|nothing (else|more) to|completed the (goal|task)/i.test(
      t
    )
  ) {
    return false;
  }
  return (
    /next batch|continuing|more companies|remaining|i('ll| will) (now |next )?(create|add|search)|starting the next|partially complete|in progress/i.test(
      t
    ) || /now creating|still need|left to create|\d+\s+more/i.test(t)
  );
}
