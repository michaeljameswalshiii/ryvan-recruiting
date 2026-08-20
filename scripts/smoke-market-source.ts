/**
 * Id / skip helpers for the shared market-source pool.
 *   npx tsx scripts/smoke-market-source.ts
 */

import {
  canonicalCompanyId,
  canonicalPersonId,
  companyLookupKeys,
  normalizeDomain,
  normalizeLinkedIn,
  personLookupKeys,
  shouldSkipAtsSource,
  usableCompanyName,
} from '../src/lib/market-source/ids';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(
  normalizeLinkedIn('https://www.LinkedIn.com/in/Jane-Doe/?trk=x') ===
    'linkedin.com/in/jane-doe',
  'linkedin normalize'
);
assert(
  normalizeDomain('https://www.AcmeMfg.com/about') === 'acmemfg.com',
  'domain normalize'
);
assert(usableCompanyName('Self-Employed') === undefined, 'skip self-employed');
assert(usableCompanyName('Acme Manufacturing') === 'Acme Manufacturing', 'keep company');
assert(shouldSkipAtsSource('ats') === true, 'skip ats');
assert(shouldSkipAtsSource('apollo') === false, 'keep apollo');

const personKeys = personLookupKeys({
  name: 'Jane Doe',
  company: 'Acme Manufacturing',
  email: 'Jane@AcmeMfg.com',
  linkedinUrl: 'https://linkedin.com/in/jane-doe',
});
assert(personKeys[0] === 'market-person#li#linkedin.com/in/jane-doe', 'person canonical linkedin');
assert(
  personKeys.includes('market-person#em#jane@acmemfg.com'),
  'person email alias'
);
assert(
  canonicalPersonId({ name: 'Jane Doe', company: 'Acme' }) ===
    'market-person#nm#jane-doe#acme',
  'person name+company fallback'
);

const companyKeys = companyLookupKeys({
  name: 'Acme Manufacturing',
  website: 'https://www.acmemfg.com',
});
assert(companyKeys[0] === 'market-company#dom#acmemfg.com', 'company domain canonical');
assert(
  canonicalCompanyId({ name: 'N/A' }) === null,
  'reject empty company'
);

console.log('smoke-market-source: ok');
