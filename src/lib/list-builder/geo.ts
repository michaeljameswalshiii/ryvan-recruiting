/**
 * Geography helpers for list-builder discovery targeting.
 * @serverOnly
 */

import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

/**
 * Prefer a specific place named in the brief over a generic geography field
 * (e.g. brief "…in Brevard County…" + geography "United States" → Brevard County, Florida).
 */
export function resolveTargetGeography(
  brief: string,
  geographyField?: string
): string {
  const geo = (geographyField || '').trim();
  const b = (brief || '').trim();
  const genericGeo =
    !geo ||
    /^(united states|usa|u\.s\.a\.?|u\.s\.|us|nationwide|north america|global|world)$/i.test(
      geo
    );

  const candidates: string[] = [];

  // "in Brevard County" / "in Palm Beach County, FL"
  const inMatch = b.match(
    /\bin\s+([A-Za-z][A-Za-z0-9\s.'-]{2,60}?)(?=\s+(?:with|under|over|and|that|for|looking|please|who|which|having|,|\.|$))/i
  );
  if (inMatch?.[1]) candidates.push(inMatch[1].trim());

  // Standalone "Brevard County" / "Miami-Dade County"
  const countyMatch = b.match(
    /\b([A-Za-z][A-Za-z0-9\s.'-]{1,40}\s+(?:County|Parish))\b/i
  );
  if (countyMatch?.[1]) candidates.push(countyMatch[1].trim());

  // "near Melbourne, FL" / "around Titusville FL"
  const nearMatch = b.match(
    /\b(?:near|around|serving)\s+([A-Za-z][A-Za-z\s.'-]{2,40}?)(?=\s+(?:with|under|area|and|,|\.|$))/i
  );
  if (nearMatch?.[1]) candidates.push(nearMatch[1].trim());

  let place = '';
  for (const c of candidates) {
    const cleaned = c
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]+$/g, '')
      .trim();
    if (cleaned.length >= 3 && cleaned.length <= 80) {
      place = cleaned;
      break;
    }
  }

  if (place) {
    if (/brevard/i.test(place) && !/florida|\bfl\b/i.test(place)) {
      place = `${place.replace(/,?\s*$/, '')}, Florida`;
    }
    if (/palm\s*beach/i.test(place) && !/florida|\bfl\b/i.test(place)) {
      place = `${place.replace(/,?\s*$/, '')}, Florida`;
    }
    if (
      genericGeo ||
      place.toLowerCase().includes(geo.toLowerCase().slice(0, 12))
    ) {
      return place;
    }
    if (geo && !place.toLowerCase().includes(geo.toLowerCase())) {
      return `${place}, ${geo}`;
    }
    return place;
  }

  return geo || LIST_BUILDER_DEFAULTS.geography;
}

function localityTokens(targetGeo: string): string[] {
  return targetGeo
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !['county', 'parish', 'united', 'states', 'usa', 'the', 'and'].includes(
          t
        )
    );
}

/** Soft check: city/text mentions target locality when we have a specific geo */
export function looksInTargetArea(
  city: string | undefined,
  companyName: string,
  targetGeo: string
): boolean {
  const tokens = localityTokens(targetGeo);
  if (tokens.length === 0) return true;
  if (/^(united states|usa|us|nationwide)$/i.test(targetGeo.trim())) {
    return true;
  }
  const hay = `${city || ''} ${companyName}`.toLowerCase();
  const distinctive = tokens.filter((t) => t.length >= 4);
  if (distinctive.length === 0) return true;
  if (!(city || '').trim()) return true;
  return distinctive.some((t) => hay.includes(t));
}
