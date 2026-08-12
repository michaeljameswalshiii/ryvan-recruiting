/**
 * Occupation / field alignment for Fit Score V2.
 * An accountant with overlapping "budget" skills is not a construction PM.
 */

export type OccupationField =
  | "construction"
  | "accounting_finance"
  | "software_it"
  | "healthcare"
  | "manufacturing_ops"
  | "sales"
  | "hr_recruiting"
  | "legal"
  | "education"
  | "marketing"
  | "hospitality"
  | "logistics"
  | "insurance"
  | "real_estate"
  | "executive_general"
  | "unknown";

export type FieldAlignment = "same" | "adjacent" | "unrelated" | "unknown";

type FieldDef = {
  id: OccupationField;
  label: string;
  title: RegExp;
  keywords: RegExp;
};

const FIELDS: FieldDef[] = [
  {
    id: "construction",
    label: "construction / project delivery",
    title:
      /\b(superintendent|project\s*manager|project\s*engineer|estimator|foreman|general\s*contractor|project\s*executive|assistant\s*pm|field\s*engineer|construction\s*manager)\b/i,
    keywords:
      /\b(rfi|rfis|submittals|change\s*orders?|gc\b|general\s*contractor|jobsite|job\s*site|osha|procore|bluebeam|punch\s*list|closeout|csi\s*division|structural\s*steel|tilt[- ]up|ground[- ]up|tenant\s*improvement|self[- ]perform|subcontractor|superintendent|construction|commercial\s*build|hard[- ]bid|gc\/cm)\b/i,
  },
  {
    id: "accounting_finance",
    label: "accounting / finance",
    title:
      /\b(accountant|controller|bookkeeper|staff\s*accountant|cpa|cfo|fp&a|financial\s*analyst|ap\s*clerk|ar\s*clerk|payroll\s*specialist|auditor)\b/i,
    keywords:
      /\b(month[- ]end|journal\s*entr(?:y|ies)|reconciliations?|general\s*ledger|\bgaap\b|\bcpa\b|accounts\s*payable|accounts\s*receivable|quickbooks|accrual|1099|trial\s*balance|bank\s*rec|close\s*the\s*books|financial\s*statements)\b/i,
  },
  {
    id: "software_it",
    label: "software / IT",
    title:
      /\b(software\s*engineer|developer|programmer|devops|sre|data\s*engineer|product\s*manager|scrum\s*master|qa\s*engineer|full[- ]stack|frontend|backend)\b/i,
    keywords:
      /\b(javascript|typescript|python|react|node\.?js|aws|kubernetes|api|microservices|sql|ci\/cd|github|agile\s*sprint|saas)\b/i,
  },
  {
    id: "healthcare",
    label: "healthcare",
    title:
      /\b(registered\s*nurse|\brn\b|physician|medical\s*assistant|cna|nurse\s*practitioner|pharmacist|therapist|clinical)\b/i,
    keywords:
      /\b(patient\s*care|hipaa|emr|ehr|epic\s*systems|bedside|clinical|nursing|hospital|physician)\b/i,
  },
  {
    id: "manufacturing_ops",
    label: "manufacturing / plant operations",
    title:
      /\b(plant\s*manager|production\s*manager|manufacturing|process\s*engineer|quality\s*engineer|cnc|machinist|operations\s*manager)\b/i,
    keywords:
      /\b(cnc|lean\s*manufactur|six\s*sigma|shop\s*floor|production\s*line|tool(?:\s*and\s*|&)?\s*die|oee|iso\s*9001|machining|fabrication)\b/i,
  },
  {
    id: "sales",
    label: "sales / business development",
    title:
      /\b(account\s*executive|sales\s*manager|business\s*development|sdr|bdr|ae\b|sales\s*rep)\b/i,
    keywords:
      /\b(quota|pipeline|crm|salesforce|closed[- ]won|prospecting|hunter|ae\s*quota)\b/i,
  },
  {
    id: "hr_recruiting",
    label: "HR / recruiting",
    title:
      /\b(recruiter|talent\s*acquisition|hr\s*manager|human\s*resources|sourcer|people\s*ops)\b/i,
    keywords:
      /\b(ats\b|requisition|full[- ]desk|boolean\s*search|onboarding|employee\s*relations|i-9)\b/i,
  },
  {
    id: "legal",
    label: "legal",
    title: /\b(attorney|lawyer|counsel|paralegal|associate\s*attorney)\b/i,
    keywords: /\b(litigation|deposition|briefing|bar\s*admission|discovery|court)\b/i,
  },
  {
    id: "education",
    label: "education",
    title: /\b(teacher|principal|instructor|professor|dean|school\s*counselor)\b/i,
    keywords: /\b(classroom|curriculum|students|lesson\s*plan|k-12|iep)\b/i,
  },
  {
    id: "marketing",
    label: "marketing / communications",
    title: /\b(marketing\s*manager|brand\s*manager|content\s*strategist|seo|demand\s*gen)\b/i,
    keywords: /\b(campaign|seo|sem|brand|content\s*calendar|hubspot|paid\s*media)\b/i,
  },
  {
    id: "hospitality",
    label: "hospitality / food service",
    title: /\b(chef|sous|restaurant\s*manager|hotel\s*manager|gm\s*hotel|bartender)\b/i,
    keywords: /\b(front\s*of\s*house|back\s*of\s*house|f&b|hospitality|guest\s*satisfaction)\b/i,
  },
  {
    id: "logistics",
    label: "logistics / supply chain",
    title:
      /\b(logistics\s*manager|supply\s*chain|warehouse\s*manager|dispatcher|procurement)\b/i,
    keywords: /\b(freight|warehouse|wms|3pl|inventory|otif|inbound|outbound\s*freight)\b/i,
  },
  {
    id: "insurance",
    label: "insurance",
    title: /\b(adjuster|underwriter|claims\s*examiner|producer|insurance\s*agent)\b/i,
    keywords: /\b(claims|underwriting|policyholder|first[- ]party|cat\s*event|acv|rcvs?)\b/i,
  },
  {
    id: "real_estate",
    label: "real estate",
    title: /\b(realtor|broker|leasing\s*agent|property\s*manager|asset\s*manager)\b/i,
    keywords: /\b(lease|noi|cap\s*rate|tenant\s*reps?|property\s*management|listings?)\b/i,
  },
];

const ADJACENT: Array<[OccupationField, OccupationField]> = [
  ["construction", "real_estate"],
  ["construction", "manufacturing_ops"],
  ["accounting_finance", "insurance"],
  ["software_it", "manufacturing_ops"],
  ["sales", "marketing"],
  ["sales", "hospitality"],
  ["logistics", "manufacturing_ops"],
  ["hr_recruiting", "sales"],
];

export type FieldFitResult = {
  jobField: OccupationField;
  candidateField: OccupationField;
  jobLabel: string;
  candidateLabel: string;
  alignment: FieldAlignment;
  /** Multiply both V1 and V2 scores by this. */
  multiplier: number;
  reason: string;
};

function scoreField(text: string, title: string, def: FieldDef): number {
  let n = 0;
  if (def.title.test(title)) n += 4;
  const hits = text.match(new RegExp(def.keywords.source, "gi"));
  n += Math.min(6, hits?.length || 0);
  if (def.keywords.test(title)) n += 2;
  return n;
}

function pickField(title: string, body: string): { id: OccupationField; label: string; score: number } {
  const blob = `${title}\n${body}`;
  let best: { id: OccupationField; label: string; score: number } = {
    id: "unknown",
    label: "unclear",
    score: 0,
  };
  for (const def of FIELDS) {
    const s = scoreField(blob, title, def);
    if (s > best.score) best = { id: def.id, label: def.label, score: s };
  }
  if (best.score < 2) {
    return { id: "unknown", label: "unclear", score: best.score };
  }
  return best;
}

function isAdjacent(a: OccupationField, b: OccupationField): boolean {
  if (a === "unknown" || b === "unknown") return false;
  return ADJACENT.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

export function assessFieldFit(input: {
  jobTitle?: string;
  jobDescription?: string;
  candidateTitle?: string;
  candidateSummary?: string;
  candidateExperience?: Array<{ title?: string; company?: string; description?: string }>;
}): FieldFitResult {
  const jobTitle = input.jobTitle || "";
  const jobText = `${jobTitle}\n${input.jobDescription || ""}`;
  const recent = (input.candidateExperience || [])
    .slice(0, 3)
    .map((e) => [e.title, e.company, e.description].filter(Boolean).join(" "))
    .join("\n");
  const candTitle = input.candidateTitle || "";
  const candText = `${candTitle}\n${input.candidateSummary || ""}\n${recent}`;

  const job = pickField(jobTitle, jobText);
  const cand = pickField(candTitle, candText);

  if (job.id === "unknown") {
    return {
      jobField: job.id,
      candidateField: cand.id,
      jobLabel: job.label,
      candidateLabel: cand.label,
      alignment: "unknown",
      multiplier: 1,
      reason: "Job field is not specific enough to apply a field gate",
    };
  }

  if (cand.id === "unknown") {
    return {
      jobField: job.id,
      candidateField: cand.id,
      jobLabel: job.label,
      candidateLabel: cand.label,
      alignment: "unknown",
      multiplier: 0.85,
      reason: `Role is ${job.label}; candidate field is unclear from title/history`,
    };
  }

  if (job.id === cand.id) {
    return {
      jobField: job.id,
      candidateField: cand.id,
      jobLabel: job.label,
      candidateLabel: cand.label,
      alignment: "same",
      multiplier: 1,
      reason: `Same field: ${job.label}`,
    };
  }

  if (isAdjacent(job.id, cand.id)) {
    return {
      jobField: job.id,
      candidateField: cand.id,
      jobLabel: job.label,
      candidateLabel: cand.label,
      alignment: "adjacent",
      multiplier: 0.72,
      reason: `Adjacent fields (${cand.label} vs ${job.label}) — transferable, not a direct fit`,
    };
  }

  return {
    jobField: job.id,
    candidateField: cand.id,
    jobLabel: job.label,
    candidateLabel: cand.label,
    alignment: "unrelated",
    multiplier: 0.38,
    reason: `Field mismatch: ${cand.label} background vs ${job.label} role. Shared skills (budget, Excel, coordination) are not enough.`,
  };
}
