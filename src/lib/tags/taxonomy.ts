import type {
  TagFacet,
  TagObjectType,
  TaxonomyEntry,
  TenantTaxonomyOverrides,
} from "./types";

const ALL: TagObjectType[] = ["candidate", "job", "company", "contact"];
const PEOPLE: TagObjectType[] = ["candidate", "job", "contact"];
const TALENT: TagObjectType[] = ["candidate", "job"];
const FIRM: TagObjectType[] = ["company", "job", "contact"];

function e(
  id: string,
  label: string,
  facet: TagFacet,
  synonyms: string[],
  objects: TagObjectType[] = ALL
): TaxonomyEntry {
  return { id, label, facet, synonyms, objects };
}

/** Master controlled library. Recruiters can disable or add via tenant overrides. */
export const BASE_TAXONOMY: TaxonomyEntry[] = [
  // ── Industry ──────────────────────────────────────────────
  e("construction", "Construction", "industry", [
    "general contractor", "gc", "preconstruction", "pre-construction",
    "commercial construction", "residential construction", "job site",
  ]),
  e("manufacturing", "Manufacturing", "industry", [
    "precision manufacturing", "production", "plant operations", "factory",
  ]),
  e("aerospace", "Aerospace", "industry", ["aviation", "aircraft", "aero"]),
  e("defense", "Defense", "industry", ["dod", "defence", "military contractor"]),
  e("medical-device", "Medical Device", "industry", [
    "med device", "medical devices", "iso 13485",
  ]),
  e("healthcare", "Healthcare", "industry", [
    "hospital", "clinical", "health care", "registered nurse",
  ]),
  e("saas", "SaaS", "industry", ["software as a service", "b2b saas"]),
  e("software", "Software", "industry", [
    "software company", "technology", "tech",
  ], FIRM),
  e("finance", "Finance", "industry", [
    "financial services", "banking", "accounting firm",
  ]),
  e("hospitality", "Hospitality", "industry", [
    "hotel", "restaurant", "food and beverage", "f&b",
  ]),
  e("logistics", "Logistics", "industry", [
    "supply chain", "freight", "warehouse", "distribution",
  ]),
  e("plastics", "Plastics", "industry", [
    "injection molding", "lsr", "polymer",
  ]),
  e("automotive", "Automotive", "industry", ["auto", "oem", "tier 1"]),
  e("energy", "Energy", "industry", ["oil and gas", "renewable", "utilities"]),
  e("real-estate", "Real Estate", "industry", ["cre", "property", "development"]),
  e("staffing", "Staffing", "industry", ["recruiting", "rpo", "talent acquisition firm"], FIRM),

  // ── Functional ────────────────────────────────────────────
  e("project-management", "Project Management", "functional", [
    "project manager", "project management", "program manager", "pm",
    "project lead", "construction project manager",
  ], PEOPLE),
  e("operations", "Operations", "functional", [
    "operations management", "ops", "director of operations",
  ]),
  e("engineering", "Engineering", "functional", [
    "engineer", "engineering department",
  ]),
  e("sales", "Sales", "functional", [
    "account executive", "business development", "outside sales",
  ]),
  e("finance-fn", "Finance", "functional", [
    "accounting", "controller", "cfo", "bookkeeper",
  ]),
  e("hr", "HR", "functional", [
    "human resources", "people operations", "talent",
  ]),
  e("it", "IT", "functional", [
    "information technology", "systems", "help desk",
  ]),
  e("estimating", "Estimating", "functional", ["estimator", "takeoff"], TALENT),
  e("superintendent", "Superintendent", "functional", [
    "site superintendent", "field superintendent",
  ], TALENT),

  // ── Skills / specialties ──────────────────────────────────
  e("cnc", "CNC", "skill", [
    "cnc machining", "cnc machine", "cnc mill", "cnc lathe",
    "computer numerical control", "cnc manufacturing",
  ], TALENT),
  e("lean", "Lean Manufacturing", "skill", [
    "lean", "lean manufacturing", "continuous improvement", "kaizen",
    "process improvement",
  ], TALENT),
  e("injection-molding", "Injection Molding", "skill", [
    "injection moulding", "lsr", "liquid silicone rubber",
  ], TALENT),
  e("erp", "ERP", "skill", ["enterprise resource planning"], TALENT),
  e("gmp", "GMP", "skill", ["good manufacturing practice", "cgmp"], TALENT),
  e("process-validation", "Process Validation", "skill", [
    "iq oq pq", "validation protocol",
  ], TALENT),
  e("scheduling", "Scheduling", "skill", ["project scheduling", "lookahead"], TALENT),
  e("budgeting", "Budgeting", "skill", ["cost control", "job cost"], TALENT),
  e("preconstruction", "Preconstruction", "skill", ["pre-construction"], TALENT),

  // ── Software ──────────────────────────────────────────────
  e("autocad", "AutoCAD", "software", ["auto cad", "cad"], TALENT),
  e("solidworks", "SolidWorks", "software", ["solid works"], TALENT),
  e("salesforce", "Salesforce", "software", ["sfdc"], TALENT),
  e("sap", "SAP", "software", ["sap erp"], TALENT),
  e("hubspot", "HubSpot", "software", ["hub spot"], TALENT),
  e("excel", "Excel", "software", ["microsoft excel", "advanced excel"], TALENT),
  e("procore", "Procore", "software", [], TALENT),
  e("bluebeam", "Bluebeam", "software", ["bluebeam revu"], TALENT),
  e("ms-project", "Microsoft Project", "software", ["ms project"], TALENT),

  // ── Certifications ────────────────────────────────────────
  e("pmp", "PMP", "certification", [
    "project management professional", "pmp certified",
  ], TALENT),
  e("six-sigma", "Six Sigma", "certification", [
    "lean six sigma", "six sigma green belt", "six sigma black belt",
  ], TALENT),
  e("aws-cert", "AWS", "certification", [
    "amazon web services", "aws certified",
  ], TALENT),
  e("iso-13485", "ISO 13485", "certification", ["iso13485"], TALENT),
  e("as9100", "AS9100", "certification", ["as 9100", "as9100d"], TALENT),
  e("osha", "OSHA", "certification", ["osha 30", "osha 10"], TALENT),

  // ── Seniority ─────────────────────────────────────────────
  e("entry", "Entry", "seniority", [
    "entry level", "junior", "associate", "0-2 years",
  ], PEOPLE),
  e("mid", "Mid", "seniority", ["mid level", "mid-level", "intermediate"], PEOPLE),
  e("senior", "Senior", "seniority", ["sr.", "sr ", "senior-level"], PEOPLE),
  e("executive", "Executive", "seniority", [
    "director", "vp", "vice president", "c-level", "ceo", "coo", "cfo", "head of",
  ], PEOPLE),

  // ── Languages / work style ────────────────────────────────
  e("spanish", "Spanish", "language", ["bilingual spanish", "fluent spanish"], TALENT),
  e("remote", "Remote", "work_preference", ["work from home", "wfh", "fully remote"], TALENT),
  e("hybrid", "Hybrid", "work_preference", ["hybrid remote"], TALENT),
  e("onsite", "On-site", "work_preference", ["on site", "in office", "in-office"], TALENT),
  e("direct-hire", "Direct Hire", "employment_type", ["perm", "permanent", "fte"], TALENT),
  e("contract", "Contract", "employment_type", ["contractor", "1099", "c2h"], TALENT),
  e("contract-to-hire", "Contract-to-Hire", "employment_type", [
    "c2h", "contract to hire",
  ], TALENT),

  // ── Company size ──────────────────────────────────────────
  e("size-1-50", "1-50 Employees", "company_size", [
    "small company", "startup", "under 50",
  ], FIRM),
  e("size-50-plus", "50+ Employees", "company_size", [
    "50-person", "55-person", "50+ person", "team of 50", "managed 50",
    "50+ employees", "over 50 employees",
  ], ALL),
  e("size-100-plus", "100+ Employees", "company_size", [
    "100-person", "over 100 employees",
  ], FIRM),

  // ── Contact decision roles ────────────────────────────────
  e("hiring-manager", "Hiring Manager", "decision_role", [
    "hiring mgr", "hm",
  ], ["contact", "job"]),
  e("decision-maker", "Decision Maker", "decision_role", [
    "economic buyer", "budget holder",
  ], ["contact"]),
  e("hr-contact", "HR", "decision_role", ["recruiter contact", "talent partner"], [
    "contact",
  ]),
];

const BY_ID = new Map(BASE_TAXONOMY.map((row) => [row.id, row]));

export function getTaxonomyEntry(id: string): TaxonomyEntry | undefined {
  return BY_ID.get(id);
}

export function mergeTaxonomy(
  overrides?: TenantTaxonomyOverrides | null
): TaxonomyEntry[] {
  const disabled = new Set(
    (overrides?.disabledIds || []).map((id) => id.trim()).filter(Boolean)
  );
  const extra = Array.isArray(overrides?.extra) ? overrides!.extra! : [];
  const seen = new Set<string>();
  const out: TaxonomyEntry[] = [];
  for (const row of [...BASE_TAXONOMY, ...extra]) {
    if (!row?.id || disabled.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      label: row.label,
      facet: row.facet,
      synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
      objects: Array.isArray(row.objects) && row.objects.length ? row.objects : ALL,
    });
  }
  return out;
}

export function labelToId(label: string, taxonomy = BASE_TAXONOMY): string | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  for (const row of taxonomy) {
    if (row.label.toLowerCase() === key || row.id === key) return row.id;
    if (row.synonyms.some((s) => s.toLowerCase() === key)) return row.id;
  }
  return null;
}

/** Expand a search token to related labels + synonyms. */
export function expandSearchToken(
  token: string,
  taxonomy = BASE_TAXONOMY
): string[] {
  const key = token.trim().toLowerCase();
  if (!key || key.length < 2) return [key];
  const out = new Set<string>([key]);
  for (const row of taxonomy) {
    const hay = [row.id, row.label, ...row.synonyms].map((s) => s.toLowerCase());
    if (hay.some((h) => taxonomyTermMatchesQuery(h, key))) {
      out.add(row.label.toLowerCase());
      out.add(row.id);
      for (const syn of row.synonyms) out.add(syn.toLowerCase());
    }
  }
  return [...out];
}

function taxonomyTermMatchesQuery(term: string, query: string): boolean {
  if (term === query) return true;

  // Keep useful partial taxonomy searches while preventing names such as
  // "Anita" from expanding through the short "IT" taxonomy label.
  if (query.length >= 4 && term.includes(query)) return true;
  if (term.length < 4) return false;

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escapedTerm}(?:$|[^a-z0-9])`, "i").test(query);
}
