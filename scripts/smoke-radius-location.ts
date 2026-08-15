import assert from 'node:assert/strict';
import {
  CompositeLocationProvider,
  bundledCityLocationProvider,
  createLocationAnchor,
  createLookupLocationProvider,
  evaluateCandidateRadius,
  findNearbyUsCityLocations,
  haversineMiles,
  parseRadiusPreset,
  parseUsLocation,
} from '../src/lib/sourcing/radius-location';

const locations = createLookupLocationProvider([
  { city: 'Miami', stateCode: 'FL', postalCode: '33101', latitude: 25.7617, longitude: -80.1918 },
  { city: 'Hollywood', stateCode: 'FL', latitude: 26.0112, longitude: -80.1495 },
  { city: 'Fort Lauderdale', stateCode: 'FL', latitude: 26.1224, longitude: -80.1373 },
  { city: 'West Palm Beach', stateCode: 'FL', latitude: 26.7153, longitude: -80.0534 },
  { city: 'Austin', stateCode: 'TX', postalCode: '78701', latitude: 30.2672, longitude: -97.7431 },
]);

const throwingProvider = {
  async resolve(): Promise<never> {
    throw new Error('simulated provider outage');
  },
};

async function main() {
  assert.deepEqual(parseUsLocation('Miami, Florida 33101'), {
    raw: 'Miami, Florida 33101', city: 'Miami', stateCode: 'FL', postalCode: '33101', scope: 'city',
  });
  assert.equal(parseUsLocation('FL')?.scope, 'state');
  assert.equal(parseUsLocation('78701')?.scope, 'postal');
  assert.equal(parseUsLocation('Remote')?.scope, 'anywhere');
  assert.equal(parseUsLocation('Washington, DC')?.city, 'Washington');
  assert.equal(parseRadiusPreset('25 miles'), '25');
  assert.equal(parseRadiusPreset('statewide'), 'state');
  assert.equal(parseRadiusPreset('250'), null);

  const miami = { latitude: 25.7617, longitude: -80.1918 };
  const fortLauderdale = { latitude: 26.1224, longitude: -80.1373 };
  const distance = haversineMiles(miami, fortLauderdale);
  assert.ok(distance > 24 && distance < 26, `expected about 25 miles, got ${distance}`);
  assert.throws(() => haversineMiles({ latitude: 91, longitude: 0 }, miami), RangeError);

  const fallback = new CompositeLocationProvider([throwingProvider, locations]);
  const anchor = await createLocationAnchor('Miami, FL', '25', fallback);
  assert.ok(anchor?.coordinates, 'fallback provider should resolve the anchor');

  const bundledAnchor = await createLocationAnchor('Weston, FL', '25', bundledCityLocationProvider);
  assert.ok(bundledAnchor?.coordinates, 'bundled provider should resolve ordinary US cities');
  const nearby = findNearbyUsCityLocations(bundledAnchor!, 25, 20);
  assert.ok(nearby.some((value) => /Fort Lauderdale, FL/i.test(value)));
  const bundledNearby = await evaluateCandidateRadius({
    anchor: bundledAnchor!, preset: '25', candidate: { location: 'Hollywood, FL' }, provider: bundledCityLocationProvider,
  });
  assert.equal(bundledNearby.matches, true);

  const exactMatch = await evaluateCandidateRadius({
    anchor: (await createLocationAnchor('Miami, FL', 'exact'))!,
    preset: 'exact',
    candidate: { location: 'Miami, Florida' },
  });
  assert.equal(exactMatch.matches, true);

  const wrongSameStateCity = await evaluateCandidateRadius({
    anchor: (await createLocationAnchor('Miami, FL', 'exact'))!,
    preset: 'exact',
    candidate: { location: 'Orlando, FL' },
  });
  assert.equal(wrongSameStateCity.status, 'different_locality');

  const within25 = await evaluateCandidateRadius({
    anchor: anchor!, preset: '25', candidate: { location: 'Hollywood, FL' }, provider: locations,
  });
  assert.equal(within25.matches, true);
  assert.ok(within25.distanceMiles && within25.distanceMiles < 25);

  const outside25 = await evaluateCandidateRadius({
    anchor: anchor!, preset: '25', candidate: { location: 'West Palm Beach, FL' }, provider: locations,
  });
  assert.equal(outside25.status, 'outside_radius');

  const directCoordinates = await evaluateCandidateRadius({
    anchor: anchor!, preset: '50', candidate: { location: 'Candidate supplied', coordinates: fortLauderdale },
  });
  assert.equal(directCoordinates.matches, true);

  const statewide = await evaluateCandidateRadius({
    anchor: (await createLocationAnchor('Florida', 'state'))!,
    preset: 'state', candidate: { city: 'Tampa', state: 'FL' },
  });
  assert.equal(statewide.matches, true);

  const unresolved = await evaluateCandidateRadius({
    anchor: anchor!, preset: '25', candidate: { location: 'Unknownville, FL' }, provider: locations,
  });
  assert.equal(unresolved.status, 'unresolved_candidate');

  const anywhere = await evaluateCandidateRadius({
    anchor: (await createLocationAnchor('Remote', 'anywhere'))!,
    preset: 'anywhere', candidate: {},
  });
  assert.equal(anywhere.matches, true);

  console.log('radius-location smoke: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
