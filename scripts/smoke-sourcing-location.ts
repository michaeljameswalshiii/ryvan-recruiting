import {
  canonicalizeApolloLocation,
  expandApolloLocations,
  personMatchesGeoTarget,
} from '../src/lib/sourcing/job-candidate-search';

const exact = expandApolloLocations(['Weston, FL']);
const statewide = expandApolloLocations(['Florida']);

const checks: Array<[string, boolean, unknown]> = [
  [
    'city_search_keeps_city_variants',
    exact.includes('Weston, FL') && exact.includes('Weston, Florida'),
    exact,
  ],
  [
    'city_search_has_no_statewide_fallback',
    !exact.some((value) => /^Florida(?:,|$)/i.test(value)),
    exact,
  ],
  [
    'state_search_still_expands_for_recall',
    statewide.includes('Florida, US') && statewide.includes('Miami, Florida'),
    statewide,
  ],
  [
    'exact_city_accepts_requested_city',
    personMatchesGeoTarget('Weston, Florida, United States', ['Weston, FL']),
    'Weston, Florida, United States',
  ],
  [
    'exact_city_rejects_other_same_state_city',
    !personMatchesGeoTarget('Miami, Florida, United States', ['Weston, FL']),
    'Miami, Florida, United States',
  ],
  [
    'exact_city_rejects_unknown_location',
    !personMatchesGeoTarget(undefined, ['Weston, FL']),
    undefined,
  ],
  [
    'state_search_accepts_same_state_city',
    personMatchesGeoTarget('Tampa, Florida, United States', ['Florida']),
    'Tampa, Florida, United States',
  ],
  [
    'state_search_rejects_other_state',
    !personMatchesGeoTarget('Austin, Texas, United States', ['Florida']),
    'Austin, Texas, United States',
  ],
  [
    'canonical_city_does_not_add_state',
    canonicalizeApolloLocation('Miami, FL').every((value) =>
      /^Miami,/i.test(value)
    ),
    canonicalizeApolloLocation('Miami, FL'),
  ],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, detail ?? '');
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} location sourcing check(s) failed.`);
  process.exit(1);
}

console.log('\nAll location sourcing checks passed.');
