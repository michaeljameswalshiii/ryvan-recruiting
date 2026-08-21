/**
 * Unified cost breakdown for AI turns and Fill-job runs.
 * LLM uses tokens; Apollo uses results + credits (search is typically 0 credits).
 *
 * @serverOnly
 */

export type LlmCostSlice = {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  modelId?: string;
};

export type ApolloCostSlice = {
  /** People/org rows returned */
  results: number;
  /**
   * Apollo credits consumed.
   * People API Search (mixed_people/api_search) is $0 credits per Apollo docs.
   * Enrichment endpoints consume credits (email/phone).
   */
  credits: number;
  estimatedUsd: number;
  endpoint?: string;
  /** e.g. "People Search — no credit cost" */
  note?: string;
};

export type EngineCostSlice = {
  engine: string;
  results?: number;
  credits?: number;
  queries?: number;
  estimatedUsd: number;
  note?: string;
};

export type CostBreakdown = {
  llm?: LlmCostSlice;
  apollo?: ApolloCostSlice;
  engines?: EngineCostSlice[];
  totalEstimatedUsd: number;
  surface?: string;
};

/** People API Search does not consume Apollo credits (official docs). */
export const APOLLO_PEOPLE_SEARCH_CREDITS = 0;

/**
 * Apollo People Search is a discovery operation, not a per-result billable
 * enrichment. Keep it at $0 even if an old environment variable is present.
 * Fill-run estimates include only actual AI work and Apollo credits consumed.
 */
export function apolloSearchUsdEstimate(_resultsCount: number): number {
  return 0;
}

export function apolloCreditsUsd(credits: number): number {
  const per = Number(process.env.APOLLO_USD_PER_CREDIT) || 0.01;
  return Math.max(0, credits) * per;
}

export function buildApolloSearchSlice(params: {
  results: number;
  endpoint?: string;
  credits?: number;
}): ApolloCostSlice {
  const credits =
    params.credits != null
      ? params.credits
      : APOLLO_PEOPLE_SEARCH_CREDITS;
  const fromCredits = apolloCreditsUsd(credits);
  const fromSearch = apolloSearchUsdEstimate(params.results);
  return {
    results: params.results,
    credits,
    estimatedUsd: fromCredits + fromSearch,
    endpoint: params.endpoint || 'mixed_people/api_search',
    note:
      credits === 0
        ? 'People API Search — 0 Apollo credits (plan rate limits still apply)'
        : `${credits} Apollo credit(s)`,
  };
}

export function sumBreakdown(parts: {
  llm?: LlmCostSlice | null;
  apollo?: ApolloCostSlice | null;
  engines?: EngineCostSlice[] | null;
}): CostBreakdown {
  const engines = parts.engines || [];
  const llmUsd = parts.llm?.estimatedUsd || 0;
  const apolloUsd = parts.apollo?.estimatedUsd || 0;
  const enginesUsd = engines.reduce((s, e) => s + (e.estimatedUsd || 0), 0);
  return {
    llm: parts.llm || undefined,
    apollo: parts.apollo || undefined,
    engines: engines.length ? engines : undefined,
    totalEstimatedUsd: llmUsd + apolloUsd + enginesUsd,
  };
}

export function formatBreakdownLine(b: CostBreakdown): string {
  const bits: string[] = [];
  if (b.llm) {
    const tok = (b.llm.inputTokens || 0) + (b.llm.outputTokens || 0);
    bits.push(`LLM ${tok} tok · $${b.llm.estimatedUsd.toFixed(4)}`);
  }
  if (b.apollo) {
    bits.push(
      `Apollo ${b.apollo.results} results · ${b.apollo.credits} cr · $${b.apollo.estimatedUsd.toFixed(4)}`
    );
  }
  for (const e of b.engines || []) {
    bits.push(`${e.engine} · $${e.estimatedUsd.toFixed(4)}`);
  }
  if (!bits.length) return `Total $${b.totalEstimatedUsd.toFixed(4)}`;
  return bits.join(' · ') + ` · Total $${b.totalEstimatedUsd.toFixed(4)}`;
}
