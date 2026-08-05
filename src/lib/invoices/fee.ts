/**
 * Placement fee helpers — parse salary ranges, compute fee defaults.
 */

/** Parse strings like "$70,000 – $85,000", "70k-90k", "$120000" → mid or single. */
export function parseSalaryBasis(salaryRange?: string | null): {
  basis: number | null;
  label: string;
} {
  const raw = (salaryRange || "").trim();
  if (!raw) return { basis: null, label: "" };

  const normalized = raw
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const toNum = (s: string): number | null => {
    const t = s.trim();
    const k = t.match(/^(\d+(?:\.\d+)?)\s*k$/i);
    if (k) return Math.round(parseFloat(k[1]) * 1000);
    const n = parseFloat(t.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const range = normalized.match(
    /(\d+(?:\.\d+)?\s*k?)\s*[-–—to]+\s*(\d+(?:\.\d+)?\s*k?)/i
  );
  if (range) {
    const a = toNum(range[1]);
    const b = toNum(range[2]);
    if (a != null && b != null) {
      const mid = Math.round((a + b) / 2);
      return { basis: mid, label: raw };
    }
  }

  const single = toNum(normalized);
  if (single != null) return { basis: single, label: raw };
  return { basis: null, label: raw };
}

export function computePlacementFee(opts: {
  feeType: "percent" | "flat";
  feePercent?: number;
  feeFlat?: number;
  salaryBasis?: number | null;
}): { amount: number; description: string } {
  if (opts.feeType === "flat") {
    const amount = Math.max(0, Number(opts.feeFlat) || 0);
    return {
      amount,
      description: "Placement fee (flat)",
    };
  }
  const pct = Number(opts.feePercent);
  const percent = Number.isFinite(pct) ? pct : 20;
  const basis = Number(opts.salaryBasis) || 0;
  const amount = Math.round(basis * (percent / 100) * 100) / 100;
  return {
    amount,
    description:
      basis > 0
        ? `Placement fee (${percent}% of $${basis.toLocaleString("en-US")})`
        : `Placement fee (${percent}%)`,
  };
}

export function formatMoney(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
