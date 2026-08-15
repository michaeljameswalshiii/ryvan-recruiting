import assert from 'node:assert/strict';
import { rankAtsCandidate } from '../src/lib/sourcing/ats-rediscovery';

const job = {
  title: 'Director of Manufacturing Operations',
  location: 'Weston, FL',
  description: 'Lead CNC machining operations, quality, and plant teams.',
  keywords: ['CNC', 'machining', 'quality'],
  source: 'brief' as const,
};

const strong = rankAtsCandidate({
  id: '1',
  name: 'Taylor Morgan',
  title: 'Director of Manufacturing Operations',
  location: 'Weston, FL',
  skills: ['CNC machining', 'quality systems'],
  email: 'taylor@example.com',
  experience: [{ company: 'Precision Works', title: 'Plant Director' }],
}, job);

const weak = rankAtsCandidate({
  id: '2',
  name: 'Jamie Smith',
  title: 'Graphic Designer',
  skills: ['Illustration'],
}, job);

assert.ok(strong);
assert.equal(strong?.source, 'ats');
assert.ok((strong?.rediscoveryScore || 0) >= 70);
assert.equal(weak, null);
console.log('ATS rediscovery smoke checks passed');
