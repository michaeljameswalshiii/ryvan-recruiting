/**
 * LLM re-ranks Apollo/PDL shortlist against the real job.
 * This is the quality step that turns "15 search hits" into a desk-ready shortlist.
 *
 * @serverOnly
 */

import {
  completeJson,
  fillJobRerankModelChain,
} from '@/lib/list-builder/llm-json';

export type RerankInputPerson = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  source?: string;
  snippet?: string;
};

export type RerankResultPerson = RerankInputPerson & {
  fitScore: number; // 0–100
  fitReason: string;
  mustHaveHit: boolean;
  geoOk: boolean;
};

/**
 * Score people vs JD. Prefer hard skills (CNC) in experience signal,
 * title fit, and geo — never invent new people.
 */
export async function rerankCandidatesForJob(params: {
  jobTitle: string;
  jobLocation?: string;
  jobDescription?: string;
  mustHaveKeywords?: string[];
  people: RerankInputPerson[];
  tenantId?: string | null;
  userId?: string | null;
}): Promise<{
  ranked: RerankResultPerson[];
  error?: string;
  usedLlm: boolean;
  modelId?: string;
}> {
  const people = (params.people || []).slice(0, 20);
  if (!people.length) {
    return { ranked: [], usedLlm: false };
  }

  const must = (params.mustHaveKeywords || [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 4);

  const heuristic = heuristicRerank(people, {
    jobTitle: params.jobTitle,
    jobLocation: params.jobLocation,
    mustHaveKeywords: must,
    jobDescription: params.jobDescription,
  });

  const system = `You are an expert agency sourcer ranking real candidates for a req.
You ONLY score the people provided — never invent names or companies.
Output ONLY valid JSON.

Schema:
{
  "rankings": [
    {
      "id": "person-id-exactly-as-given",
      "fitScore": 0-100,
      "fitReason": "one short sentence for the recruiter",
      "mustHaveHit": true/false,
      "geoOk": true/false
    }
  ]
}

Scoring guide (best-in-class ATS sourcing):
- 85–100: Strong title fit + geo OK + employer/context implies skill (e.g. Plant Manager at precision machine shop)
- 70–84: Good title fit; skill plausible from industry/company type even without the skill string
- 50–69: Partial (title OK but wrong industry; OR skill only as company name token)
- 0–49: Wrong function, wrong country, or pure noise

Rules:
- Prefer TITLE match to the role (Plant Manager, Director of Operations) over company name matching a skill token.
- For shop skills like CNC/EDM/machining: Apollo often only matches the string in COMPANY NAME ("CNC Industries"). That alone is a WEAK must-have — score lower than a Plant Manager at "Acme Precision Machining" without the letters C-N-C.
- mustHaveHit: true if company/industry/snippet suggests machining/manufacturing/tooling OR the skill token appears; do NOT require the skill in the person's job title.
- Soft-penalize profiles whose ONLY skill signal is the exact skill token inside the company legal name with no other manufacturing context.
- geoOk: false if location is clearly wrong country (China when job is Florida); true if US/FL/unknown.
- fitReason must be specific ("Plant Manager at machine shop — likely CNC env") not generic.
- Return one ranking object per input person id.`;

  const user = `JOB TITLE: ${params.jobTitle}
JOB LOCATION: ${params.jobLocation || '(any)'}
MUST-HAVE EXPERIENCE/SKILLS (not required in job title): ${must.join(', ') || '(none)'}

JOB DESCRIPTION (excerpt):
${(params.jobDescription || '').slice(0, 2500)}

CANDIDATES (score each by id):
${JSON.stringify(
  people.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title,
    company: p.company,
    location: p.location,
    source: p.source,
  })),
  null,
  0
)}`;

  try {
    // Sonnet for re-rank quality; list-builder stays on Haiku
    const { data, error, modelId } = await completeJson<{
      rankings?: Array<{
        id?: string;
        fitScore?: number;
        fitReason?: string;
        mustHaveHit?: boolean;
        geoOk?: boolean;
      }>;
    }>(
      system,
      user,
      {
        tenantId: params.tenantId || undefined,
        userId: params.userId || undefined,
        purpose: 'fill-job-rerank',
        queryPreview: params.jobTitle,
      },
      {
        timeoutMs: 22_000,
        modelIds: fillJobRerankModelChain(),
        temperature: 0.15,
        maxTokens: 2500,
      }
    );

    if (error || !data?.rankings?.length) {
      return {
        ranked: heuristic,
        usedLlm: false,
        error: error || 'empty rank',
        modelId,
      };
    }

    const byId = new Map(
      data.rankings
        .filter((r) => r?.id)
        .map((r) => [String(r.id), r] as const)
    );

    const ranked: RerankResultPerson[] = people.map((p) => {
      const r = byId.get(String(p.id));
      const h = heuristic.find((x) => x.id === p.id);
      const fitScore = clampScore(
        typeof r?.fitScore === 'number' ? r.fitScore : h?.fitScore ?? 50
      );
      return {
        ...p,
        fitScore,
        fitReason:
          (r?.fitReason && String(r.fitReason).slice(0, 180)) ||
          h?.fitReason ||
          'Scored from title/company/location',
        mustHaveHit:
          typeof r?.mustHaveHit === 'boolean'
            ? r.mustHaveHit
            : h?.mustHaveHit ?? false,
        geoOk: typeof r?.geoOk === 'boolean' ? r.geoOk : h?.geoOk ?? true,
      };
    });

    ranked.sort((a, b) => {
      // Prefer must-have + geo + score
      const sa =
        a.fitScore +
        (a.mustHaveHit ? 8 : 0) +
        (a.geoOk === false ? -25 : 0);
      const sb =
        b.fitScore +
        (b.mustHaveHit ? 8 : 0) +
        (b.geoOk === false ? -25 : 0);
      return sb - sa;
    });

    // Drop hard geo fails when we have enough good ones
    const geoOkList = ranked.filter((p) => p.geoOk !== false);
    const final =
      geoOkList.length >= Math.min(3, ranked.length) ? geoOkList : ranked;

    return { ranked: final, usedLlm: true, modelId };
  } catch (err: any) {
    return {
      ranked: heuristic,
      usedLlm: false,
      error: err?.message || String(err),
    };
  }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function heuristicRerank(
  people: RerankInputPerson[],
  ctx: {
    jobTitle: string;
    jobLocation?: string;
    mustHaveKeywords: string[];
    jobDescription?: string;
  }
): RerankResultPerson[] {
  const titleTokens = tokenize(ctx.jobTitle);
  const must = ctx.mustHaveKeywords.map((k) => k.toLowerCase());
  const wantsUs =
    !ctx.jobLocation ||
    /\b(florida|texas|california|united states|usa|\bfl\b|\btx\b|\bca\b)\b/i.test(
      ctx.jobLocation
    );

  const shopMust = must.some(
    (m) =>
      m === 'cnc' ||
      m.includes('edm') ||
      m.includes('machin') ||
      m.includes('tool') ||
      m.includes('die')
  );
  const mfgCompanyRe =
    /\b(machine|machining|machinist|tool(?:\s*and\s*|&)?\s*die|precision|aerospace|metal|fabrication|fabricat|stamping|foundry|industrial|manufactur|production\s*shop|cnc)\b/i;

  const ranked = people.map((p) => {
    let score = 45;
    const title = (p.title || '').toLowerCase();
    const company = (p.company || '').toLowerCase();
    const blob = [p.title, p.company, p.snippet, p.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const loc = (p.location || '').toLowerCase();

    // Title overlap (strongest signal for Fill job)
    const pTitleTok = tokenize(p.title || '');
    const overlap = titleTokens.filter((t) => pTitleTok.includes(t)).length;
    score += Math.min(28, overlap * 9);

    // Leadership / ops / plant signals
    if (
      /\b(plant|manufactur|operations|machin|cnc|production|director)\b/i.test(
        ctx.jobTitle
      ) &&
      /\b(plant|manufactur|operations|machin|production|shop|director|vp)\b/i.test(
        title
      )
    ) {
      score += 14;
    }

    const mfgContext = mfgCompanyRe.test(company) || mfgCompanyRe.test(blob);
    // Skill token only in company legal name (e.g. "CNC Industries") — weak alone
    let skillOnlyInCompanyName = false;
    let mustHaveHit = false;

    for (const m of must) {
      const ml = m.toLowerCase();
      if (company.includes(ml) && !title.includes(ml)) {
        skillOnlyInCompanyName = true;
      }
      if (blob.includes(ml)) {
        mustHaveHit = true;
      }
    }

    if (shopMust) {
      // Prefer plant/ops leaders in machining context over "CNC" string in company name
      if (mfgContext) {
        mustHaveHit = true;
        score += 16;
      }
      if (skillOnlyInCompanyName && mfgContext) {
        score += 6; // CNC + machine shop is fine
      } else if (skillOnlyInCompanyName && !mfgContext && overlap < 1) {
        score -= 12; // "Something CNC LLC" random title — deprioritize
      } else if (skillOnlyInCompanyName && overlap >= 1) {
        score += 4; // right title at a company literally named CNC
      }
      // Ops leader at machine shop without "CNC" letters still valid
      if (
        !mustHaveHit &&
        mfgContext &&
        /\b(plant|operations|manufactur|production|general\s*manager)\b/i.test(
          title
        )
      ) {
        mustHaveHit = true;
        score += 12;
      }
    } else {
      // Software / ERP tools: keyword in blob is stronger
      for (const m of must) {
        if (blob.includes(m.toLowerCase())) {
          mustHaveHit = true;
          score += 18;
          break;
        }
      }
    }

    let geoOk = true;
    if (
      wantsUs &&
      /\b(china|india|pakistan|philippines|nigeria|brazil)\b/i.test(loc)
    ) {
      geoOk = false;
      score -= 40;
    }
    if (
      ctx.jobLocation &&
      /\bflorida\b|\bfl\b/i.test(ctx.jobLocation) &&
      /\bflorida\b|\bfl\b/i.test(loc)
    ) {
      score += 10;
    }

    if (p.source === 'apollo' || p.source === 'pdl') score += 5;

    const fitReason = [
      overlap > 0 ? 'title overlap' : 'weak title match',
      shopMust && mfgContext
        ? 'manufacturing/machining employer context'
        : mustHaveHit
          ? skillOnlyInCompanyName
            ? `skill token in company name (${must[0]}) — not verified experience`
            : `must-have signal (${must[0] || 'skill'})`
          : must.length
            ? `no clear ${must[0]} signal`
            : null,
      geoOk ? null : 'geo mismatch',
      p.company ? `at ${p.company}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      ...p,
      fitScore: clampScore(score),
      fitReason: fitReason || 'Baseline shortlist score',
      mustHaveHit,
      geoOk,
    };
  });

  ranked.sort((a, b) => b.fitScore - a.fitScore);
  return ranked;
}

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .filter(
      (t) =>
        !['the', 'and', 'for', 'with', 'manager', 'director', 'senior'].includes(
          t
        )
    );
}
