/**
 * Phone normalization for SMS (E.164).
 */

export type NormalizePhoneResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

/**
 * Normalize US/CA numbers to E.164. Accepts (305) 555-1212, 3055551212, +13055551212.
 */
export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountry: 'US' | 'CA' = 'US'
): NormalizePhoneResult {
  if (!raw || !String(raw).trim()) {
    return { ok: false, error: 'Phone number is empty' };
  }
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    const rest = digits.slice(1).replace(/\D/g, '');
    if (rest.length < 10 || rest.length > 15) {
      return { ok: false, error: 'Invalid international number' };
    }
    return { ok: true, e164: `+${rest}` };
  }
  digits = digits.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return { ok: true, e164: `+${digits}` };
  }
  if (digits.length === 10 && (defaultCountry === 'US' || defaultCountry === 'CA')) {
    return { ok: true, e164: `+1${digits}` };
  }
  return {
    ok: false,
    error: 'Enter a valid 10-digit US/CA number or full E.164 (+1…)',
  };
}

/** GSM-7 rough segment estimate (160 first, 153 concatenated). UCS-2: 70/67. */
export function estimateSmsSegments(body: string): number {
  if (!body) return 1;
  // Detect non-GSM-ish characters simply
  const ucs2 = /[^\x00-\x7F]/.test(body);
  if (ucs2) {
    if (body.length <= 70) return 1;
    return Math.ceil(body.length / 67);
  }
  if (body.length <= 160) return 1;
  return Math.ceil(body.length / 153);
}

export function maskPhone(e164: string): string {
  if (e164.length < 6) return e164;
  return `${e164.slice(0, 2)}•••${e164.slice(-4)}`;
}
