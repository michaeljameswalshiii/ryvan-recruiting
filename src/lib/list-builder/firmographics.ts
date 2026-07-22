/**
 * Optional firmographic helpers for list-builder + company import.
 * Prefer reusing client.industry and client.employee_count on Dynamo company records.
 */

/** Parse employee count from free text / LLM / Apollo-style values. */
export function parseEmployeeCount(
  raw: unknown
): { employeeCount?: number; companySize?: string } {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const n = Math.floor(raw);
    return { employeeCount: n, companySize: String(n) };
  }
  const s = String(raw).trim();
  if (!s) return {};

  // "1,250" or "1250 employees"
  const plain = s.replace(/,/g, '').match(/\b(\d{1,6})\b/);
  // "51-200" / "50 to 200" / "50–200"
  const range = s
    .replace(/,/g, '')
    .match(/\b(\d{1,6})\s*[-–to]+\s*(\d{1,6})\b/i);

  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
      // Prefer midpoint as estimate; keep band as display label
      const mid = Math.floor((lo + hi) / 2);
      return {
        employeeCount: mid > 0 ? mid : undefined,
        companySize: `${lo}-${hi}`,
      };
    }
  }

  if (plain) {
    const n = parseInt(plain[1], 10);
    if (Number.isFinite(n) && n > 0) {
      return { employeeCount: n, companySize: String(n) };
    }
  }

  // Qualitative only — keep as label
  if (/sme|smb|mid[- ]?market|enterprise|startup|small|large/i.test(s)) {
    return { companySize: s.slice(0, 40) };
  }

  return { companySize: s.slice(0, 40) };
}

export function parseOpenJobsPosted(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  const s = String(raw).replace(/,/g, '');
  const m = s.match(/\b(\d{1,5})\b/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function normalizeIndustry(raw: unknown, fallback?: string): string | undefined {
  const s = (typeof raw === 'string' ? raw : raw != null ? String(raw) : '')
    .trim()
    .slice(0, 80);
  if (s) return s;
  const f = (fallback || '').trim().slice(0, 80);
  return f || undefined;
}
