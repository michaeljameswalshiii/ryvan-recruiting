/**
 * Company-level placement fee terms.
 * Copied onto jobs at create time so the job header can show Fee %.
 */

export const FEE_TYPE_OPTIONS = [
  { id: "contingency", label: "Contingency" },
  { id: "retained", label: "Retained" },
  { id: "engaged", label: "Engaged search" },
  { id: "flat", label: "Flat fee" },
] as const;

export const FEE_GUARANTEE_OPTIONS = [
  { id: "", label: "Not specified" },
  { id: "30-day replacement", label: "30-day replacement" },
  { id: "60-day replacement", label: "60-day replacement" },
  { id: "90-day replacement", label: "90-day replacement" },
  { id: "120-day replacement", label: "120-day replacement" },
] as const;

export type PlacementFeeFields = {
  fee_percent?: number;
  fee_type?: string;
  fee_guarantee?: string;
};

export function parseFeePercent(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

export function parseFeeType(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const match = FEE_TYPE_OPTIONS.find(
    (opt) => opt.id === raw.toLowerCase() || opt.label.toLowerCase() === raw.toLowerCase()
  );
  return match?.id || raw.slice(0, 40);
}

export function parseFeeGuarantee(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 80) : undefined;
}

export function feeFromRecord(record: Record<string, unknown> | null | undefined): PlacementFeeFields {
  if (!record) return {};
  return {
    fee_percent: parseFeePercent(record.fee_percent ?? record.feePercent),
    fee_type: parseFeeType(record.fee_type ?? record.feeType ?? record.fee_agreement),
    fee_guarantee: parseFeeGuarantee(
      record.fee_guarantee ?? record.feeGuarantee ?? record.guarantee_period
    ),
  };
}

export function formatFeePercentLabel(
  record: Record<string, unknown> | PlacementFeeFields | null | undefined
): string {
  if (!record) return "";
  const pct = parseFeePercent(
    (record as Record<string, unknown>).fee_percent ??
      (record as Record<string, unknown>).feePercent ??
      (record as PlacementFeeFields).fee_percent
  );
  if (pct == null) return "";
  return `${pct}%`;
}

export function exampleFeeOnSalary(percent: number, salary = 100_000): number {
  return Math.round(salary * (percent / 100));
}

export function pickPlacementFee(
  preferred: PlacementFeeFields,
  fallback: PlacementFeeFields
): PlacementFeeFields {
  return {
    fee_percent: preferred.fee_percent ?? fallback.fee_percent,
    fee_type: preferred.fee_type || fallback.fee_type,
    fee_guarantee: preferred.fee_guarantee || fallback.fee_guarantee,
  };
}

function toSalaryNumber(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  const k = t.match(/^(\d+(?:\.\d+)?)\s*k$/i);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const n = parseFloat(t.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Low / high from strings like "$70,000 – $85,000" or "70k-90k". */
export function parseSalaryBounds(salaryRange?: string | null): {
  low: number | null;
  high: number | null;
} {
  const raw = (salaryRange || "").trim();
  if (!raw) return { low: null, high: null };
  const normalized = raw.replace(/,/g, "").replace(/\$/g, "").replace(/\s+/g, " ");
  const range = normalized.match(
    /(\d+(?:\.\d+)?\s*k?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?\s*k?)/i
  );
  if (range) {
    const a = toSalaryNumber(range[1]);
    const b = toSalaryNumber(range[2]);
    if (a != null && b != null) {
      return { low: Math.min(a, b), high: Math.max(a, b) };
    }
  }
  const single = toSalaryNumber(normalized);
  return { low: single, high: single };
}

function formatDollars(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Compact salary for the job toolbar, e.g. "$70,000–$85,000". */
export function formatSalaryToolbar(salaryRange?: string | null): string {
  const { low, high } = parseSalaryBounds(salaryRange);
  if (low == null && high == null) {
    return String(salaryRange || "").trim();
  }
  if (low != null && high != null && low !== high) {
    return `${formatDollars(low)}–${formatDollars(high)}`;
  }
  return formatDollars((high ?? low) as number);
}

export function formatCommission(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "";
  return formatDollars(Math.round(amount));
}

/**
 * Estimated placement commission: fee % of the low end of the salary range
 * (or the single number if there is no range).
 */
export function commissionFromFee(
  salaryRange?: string | null,
  feePercent?: number | null
): number | null {
  if (feePercent == null || !Number.isFinite(feePercent) || feePercent <= 0) {
    return null;
  }
  const { high, low } = parseSalaryBounds(salaryRange);
  const basis = low ?? high;
  if (basis == null) return null;
  return Math.round(basis * (feePercent / 100));
}
