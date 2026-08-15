/**
 * Dependency-free US location parsing and radius matching for Fill a Job.
 *
 * This module deliberately does not call a geocoding service. Production code can
 * inject a tenant-approved provider, while tests and local workflows can use the
 * included lookup/composite providers. Unknown coordinates are reported rather
 * than silently treated as a match.
 */

import allCities from 'all-the-cities';
import zipcodes from 'zipcodes';

export const RADIUS_PRESETS = [
  { value: 'exact', label: 'Exact city', radiusMiles: 0 },
  { value: '10', label: 'Within 10 miles', radiusMiles: 10 },
  { value: '25', label: 'Within 25 miles', radiusMiles: 25 },
  { value: '50', label: 'Within 50 miles', radiusMiles: 50 },
  { value: '100', label: 'Within 100 miles', radiusMiles: 100 },
  { value: 'state', label: 'Entire state', radiusMiles: null },
  { value: 'anywhere', label: 'Anywhere', radiusMiles: null },
] as const;

export type RadiusPreset = (typeof RADIUS_PRESETS)[number]['value'];
export type NumericRadiusPreset = Extract<RadiusPreset, '10' | '25' | '50' | '100'>;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ParsedUsLocation {
  raw: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  scope: 'city' | 'state' | 'postal' | 'anywhere';
}

export interface ResolvedUsLocation extends ParsedUsLocation, Coordinates {
  source?: string;
}

export interface LocationCoordinateProvider {
  resolve(location: ParsedUsLocation): Promise<ResolvedUsLocation | null>;
}

export interface LocationAnchor {
  location: ParsedUsLocation;
  coordinates?: Coordinates;
  source?: string;
}

export type RadiusEvaluationStatus =
  | 'match'
  | 'outside_radius'
  | 'different_locality'
  | 'different_state'
  | 'invalid_candidate'
  | 'unresolved_anchor'
  | 'unresolved_candidate';

export interface RadiusEvaluation {
  matches: boolean;
  status: RadiusEvaluationStatus;
  distanceMiles?: number;
  reason: string;
}

export interface CandidateLocationInput {
  location?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  coordinates?: Coordinates | null;
}

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const STATE_CODES = new Set([...Object.values(STATE_NAMES), 'DC']);
const STATE_SUFFIXES = Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length);
const ANYWHERE = /^(?:anywhere|remote|worldwide|united states|usa|u\.s\.?a?\.?|us)$/i;

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

function normalizeToken(value: string | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeUsState(value: string | null | undefined): string | undefined {
  const normalized = normalizeToken(value || '');
  if (!normalized) return undefined;
  const upper = normalized.toUpperCase();
  if (STATE_CODES.has(upper)) return upper;
  return STATE_NAMES[normalized];
}

export function parseRadiusPreset(value: unknown): RadiusPreset | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  const aliases: Record<string, RadiusPreset> = {
    exact: 'exact', city: 'exact', '0': 'exact',
    '10': '10', '10mi': '10', '10 miles': '10',
    '25': '25', '25mi': '25', '25 miles': '25',
    '50': '50', '50mi': '50', '50 miles': '50',
    '100': '100', '100mi': '100', '100 miles': '100',
    state: 'state', statewide: 'state',
    anywhere: 'anywhere', remote: 'anywhere', worldwide: 'anywhere',
  };
  return aliases[normalized] || null;
}

export function radiusMilesForPreset(preset: RadiusPreset): number | null {
  const found = RADIUS_PRESETS.find((item) => item.value === preset);
  return found?.radiusMiles ?? null;
}

/** Parses common US forms: City, ST; City ST; City, State; ZIP; or State. */
export function parseUsLocation(value: string | null | undefined): ParsedUsLocation | null {
  if (!value) return null;
  let raw = cleanText(value);
  if (!raw) return null;
  if (ANYWHERE.test(raw)) return { raw, scope: 'anywhere' };

  raw = cleanText(raw.replace(/,?\s*(?:united states(?: of america)?|u\.?s\.?a?\.?)$/i, ''));
  const zipMatch = raw.match(/(?:^|[\s,])(\d{5})(?:-\d{4})?$/);
  const postalCode = zipMatch?.[1];
  let withoutZip = zipMatch ? cleanText(raw.slice(0, zipMatch.index).replace(/,$/, '')) : raw;

  if (!withoutZip && postalCode) return { raw: value.trim(), postalCode, scope: 'postal' };

  let stateCode: string | undefined;
  let city = withoutZip;
  const commaParts = withoutZip.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const possibleState = commaParts[commaParts.length - 1];
    stateCode = normalizeUsState(possibleState);
    if (stateCode) city = commaParts.slice(0, -1).join(', ');
  }

  if (!stateCode) {
    const lower = normalizeToken(withoutZip);
    const stateName = STATE_SUFFIXES.find(
      (name) => lower === name || lower.endsWith(` ${name}`)
    );
    if (stateName) {
      stateCode = STATE_NAMES[stateName];
      city = cleanText(withoutZip.slice(0, withoutZip.length - stateName.length));
    } else {
      const codeMatch = withoutZip.match(/(?:^|[\s,])([A-Za-z]{2})$/);
      const possibleCode = normalizeUsState(codeMatch?.[1]);
      if (codeMatch && possibleCode) {
        stateCode = possibleCode;
        city = cleanText(withoutZip.slice(0, codeMatch.index).replace(/,$/, ''));
      }
    }
  }

  if (stateCode && !city) {
    return { raw: value.trim(), stateCode, postalCode, scope: postalCode ? 'postal' : 'state' };
  }
  if (!city && !postalCode) return null;

  return {
    raw: value.trim(),
    city: city || undefined,
    stateCode,
    postalCode,
    scope: city ? 'city' : 'postal',
  };
}

export function isValidCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 && value.latitude <= 90 &&
      value.longitude >= -180 && value.longitude <= 180
  );
}

/** Great-circle distance using mean Earth radius; result is miles. */
export function haversineMiles(a: Coordinates, b: Coordinates): number {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) {
    throw new RangeError('Latitude must be -90..90 and longitude must be -180..180');
  }
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export class CompositeLocationProvider implements LocationCoordinateProvider {
  constructor(private readonly providers: readonly LocationCoordinateProvider[]) {}

  async resolve(location: ParsedUsLocation): Promise<ResolvedUsLocation | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.resolve(location);
        if (result && isValidCoordinates(result)) return result;
      } catch {
        // A secondary provider is a deliberate fallback for unavailable services.
      }
    }
    return null;
  }
}

export interface LocationLookupRecord extends Coordinates {
  city?: string;
  stateCode?: string;
  postalCode?: string;
  source?: string;
}

function locationKeys(location: Pick<ParsedUsLocation, 'city' | 'stateCode' | 'postalCode'>): string[] {
  const keys: string[] = [];
  if (location.postalCode) keys.push(`zip:${location.postalCode.slice(0, 5)}`);
  if (location.city) {
    const city = normalizeToken(location.city);
    if (location.stateCode) keys.push(`city:${city}:${location.stateCode}`);
    keys.push(`city:${city}`);
  }
  return keys;
}

/** Small deterministic provider useful for bundled, cached, or test-owned data. */
export function createLookupLocationProvider(
  records: readonly LocationLookupRecord[]
): LocationCoordinateProvider {
  const lookup = new Map<string, LocationLookupRecord>();
  for (const record of records) {
    const stateCode = normalizeUsState(record.stateCode);
    for (const key of locationKeys({ ...record, stateCode })) {
      // First record wins so fallback order remains deterministic.
      if (!lookup.has(key)) lookup.set(key, { ...record, stateCode });
    }
  }
  return {
    async resolve(location) {
      const found = locationKeys(location).map((key) => lookup.get(key)).find(Boolean);
      if (!found || !isValidCoordinates(found)) return null;
      return {
        ...location,
        city: found.city || location.city,
        stateCode: normalizeUsState(found.stateCode) || location.stateCode,
        postalCode: found.postalCode || location.postalCode,
        latitude: found.latitude,
        longitude: found.longitude,
        source: found.source || 'lookup',
      };
    },
  };
}

let bundledCityIndex: Map<string, typeof allCities> | null = null;

function getBundledCityIndex(): Map<string, typeof allCities> {
  if (bundledCityIndex) return bundledCityIndex;
  bundledCityIndex = new Map();
  for (const row of allCities) {
    if (row.country !== 'US') continue;
    const key = `${normalizeToken(row.name)}:${row.adminCode}`;
    const list = bundledCityIndex.get(key) || [];
    list.push(row);
    bundledCityIndex.set(key, list);
  }
  return bundledCityIndex;
}

/**
 * Offline city-centroid provider used in production. The bundled data avoids
 * sending candidate locations to a third-party geocoder and keeps runs fast.
 */
export const bundledCityLocationProvider: LocationCoordinateProvider = {
  async resolve(location) {
    if (location.postalCode) {
      const zip = zipcodes.lookup(location.postalCode);
      if (zip && Number.isFinite(zip.latitude) && Number.isFinite(zip.longitude)) {
        return {
          ...location,
          city: location.city || zip.city,
          stateCode: location.stateCode || zip.state,
          latitude: zip.latitude,
          longitude: zip.longitude,
          source: 'bundled-zip-data',
        };
      }
    }
    if (!location.city) return null;
    const city = location.city
      .replace(/\b(?:metropolitan|metro)\s+area\b/gi, '')
      .replace(/\s+area$/i, '')
      .trim();
    if (!city) return null;
    const index = getBundledCityIndex();
    const candidates = (location.stateCode
      ? index.get(`${normalizeToken(city)}:${location.stateCode}`) || []
      : [...index.entries()]
          .filter(([key]) => key.startsWith(`${normalizeToken(city)}:`))
          .flatMap(([, rows]) => rows))
      .sort((a, b) => (b.population || 0) - (a.population || 0));
    const found = candidates[0];
    const longitude = found?.loc?.coordinates?.[0];
    const latitude = found?.loc?.coordinates?.[1];
    if (!found || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      ...location,
      city: found.name,
      stateCode: found.adminCode || location.stateCode,
      latitude,
      longitude,
      source: 'bundled-city-data',
    };
  },
};

export async function createLocationAnchor(
  input: string,
  preset: RadiusPreset,
  provider?: LocationCoordinateProvider
): Promise<LocationAnchor | null> {
  const location = parseUsLocation(input);
  if (!location) return null;
  if (preset === 'anywhere') return { location: { ...location, scope: 'anywhere' } };

  const needsCoordinates = preset !== 'exact' && preset !== 'state';
  const shouldResolve = Boolean(provider) && (needsCoordinates || location.scope === 'postal');
  const resolved = shouldResolve ? await provider!.resolve(location) : null;
  return {
    location: resolved || location,
    coordinates: resolved
      ? { latitude: resolved.latitude, longitude: resolved.longitude }
      : undefined,
    source: resolved?.source,
  };
}

/** Apollo-friendly nearby city labels, ordered by proximity then population. */
export function findNearbyUsCityLocations(
  anchor: LocationAnchor,
  radiusMiles: number,
  maxResults = 12
): string[] {
  if (!isValidCoordinates(anchor.coordinates) || !anchor.location.stateCode) return [];
  return allCities
    .filter((row) => row.country === 'US' && row.adminCode === anchor.location.stateCode)
    .map((row) => ({
      row,
      distance: haversineMiles(anchor.coordinates!, {
        latitude: row.loc.coordinates[1],
        longitude: row.loc.coordinates[0],
      }),
    }))
    .filter(({ distance }) => distance <= radiusMiles)
    .sort((a, b) => {
      const aAnchor = normalizeToken(a.row.name) === normalizeToken(anchor.location.city);
      const bAnchor = normalizeToken(b.row.name) === normalizeToken(anchor.location.city);
      if (aAnchor !== bAnchor) return aAnchor ? -1 : 1;
      return (b.row.population || 0) - (a.row.population || 0) || a.distance - b.distance;
    })
    .slice(0, Math.max(1, Math.min(maxResults, 25)))
    .map(({ row }) => `${row.name}, ${row.adminCode}`);
}

function candidateToParsed(input: CandidateLocationInput): ParsedUsLocation | null {
  const assembled = input.location || [input.city, input.state, input.postalCode].filter(Boolean).join(', ');
  const parsed = parseUsLocation(assembled);
  if (!parsed) return null;
  return {
    ...parsed,
    city: input.city?.trim() || parsed.city,
    stateCode: normalizeUsState(input.state) || parsed.stateCode,
    postalCode: input.postalCode?.match(/\d{5}/)?.[0] || parsed.postalCode,
  };
}

function sameState(a: ParsedUsLocation, b: ParsedUsLocation): boolean {
  return Boolean(a.stateCode && b.stateCode && a.stateCode === b.stateCode);
}

function sameLocality(a: ParsedUsLocation, b: ParsedUsLocation): boolean {
  if (a.postalCode && b.postalCode && a.postalCode === b.postalCode) return true;
  if (!a.city || !b.city || normalizeToken(a.city) !== normalizeToken(b.city)) return false;
  return !a.stateCode || !b.stateCode || a.stateCode === b.stateCode;
}

/**
 * Evaluate one candidate. Radius modes are fail-closed when coordinates cannot
 * be resolved; callers can distinguish missing data from an out-of-radius result.
 */
export async function evaluateCandidateRadius(params: {
  anchor: LocationAnchor;
  preset: RadiusPreset;
  candidate: CandidateLocationInput;
  provider?: LocationCoordinateProvider;
}): Promise<RadiusEvaluation> {
  const { anchor, preset, candidate, provider } = params;
  if (preset === 'anywhere') {
    return { matches: true, status: 'match', reason: 'Anywhere mode accepts every location.' };
  }

  const parsed = candidateToParsed(candidate);
  if (!parsed) {
    return { matches: false, status: 'invalid_candidate', reason: 'Candidate location is missing or invalid.' };
  }

  if (preset === 'state') {
    const matches = sameState(anchor.location, parsed);
    return matches
      ? { matches: true, status: 'match', reason: `Candidate is in ${anchor.location.stateCode}.` }
      : { matches: false, status: 'different_state', reason: 'Candidate is not in the anchor state.' };
  }

  if (preset === 'exact') {
    const matches = sameLocality(anchor.location, parsed);
    return matches
      ? { matches: true, status: 'match', reason: 'Candidate matches the requested city or ZIP.' }
      : { matches: false, status: 'different_locality', reason: 'Candidate does not match the requested city or ZIP.' };
  }

  if (!isValidCoordinates(anchor.coordinates)) {
    return { matches: false, status: 'unresolved_anchor', reason: 'Anchor coordinates are required for a mileage radius.' };
  }

  let candidateCoordinates = isValidCoordinates(candidate.coordinates)
    ? candidate.coordinates
    : undefined;
  if (!candidateCoordinates && provider) {
    const resolved = await provider.resolve(parsed);
    if (resolved) candidateCoordinates = { latitude: resolved.latitude, longitude: resolved.longitude };
  }
  if (!candidateCoordinates) {
    return { matches: false, status: 'unresolved_candidate', reason: 'Candidate coordinates could not be resolved.' };
  }

  const distanceMiles = haversineMiles(anchor.coordinates, candidateCoordinates);
  const limit = radiusMilesForPreset(preset);
  const matches = limit != null && distanceMiles <= limit;
  return matches
    ? { matches: true, status: 'match', distanceMiles, reason: `Candidate is within ${limit} miles.` }
    : { matches: false, status: 'outside_radius', distanceMiles, reason: `Candidate is outside the ${limit}-mile radius.` };
}
