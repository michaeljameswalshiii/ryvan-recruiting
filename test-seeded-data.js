/**
 * Test accessing seeded data without authentication
 * The seeded data has tenant_id="default", so we need to work around the auth requirement
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

async function testSeededData() {
  console.log('=== Testing Seeded Data ===');
  console.log('');

  // Try to login with a valid user first
  console.log('[Step 1] Logging in with existing user...');
  const loginRes = await fetch(`${VERCEL_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: 'prodtest@test.com', password: 'Test123!' }),
  });

  const loginData = await loginRes.json();
  console.log('Login:', loginData);
  
  // Get the session cookie
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Cookie captured');
  console.log('');

  if (!cookie) {
    console.log('ERROR: No cookie captured');
    return;
  }

  // Check the session
  console.log('[Step 2] Check session...');
  const sessionRes = await fetch(`${VERCEL_URL}/api/auth/session`, {
    credentials: 'include',
    headers: { 'Cookie': cookie },
  });
  const sessionData = await sessionRes.json();
  console.log('Session:', JSON.stringify(sessionData, null, 2));
  console.log('');

  // Try to get clients - should fail without tenantId
  console.log('[Step 3] Try to get clients (should fail - no tenant)...');
  try {
    const clientsRes = await fetch(`${VERCEL_URL}/api/data/clients`, {
      credentials: 'include',
      headers: { 'Cookie': cookie },
    });
    console.log('Clients Status:', clientsRes.status);
    const clientsData = await clientsRes.json();
    console.log('Clients:', JSON.stringify(clientsData, null, 2));
  } catch (e) {
    console.log('Clients error:', e.message);
  }
  console.log('');

  // Try to seed test data
  console.log('[Step 4] Try to seed test data...');
  try {
    const seedRes = await fetch(`${VERCEL_URL}/api/seed-test-data`, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Cookie': cookie,
        'Content-Type': 'application/json',
      },
    });
    console.log('Seed Status:', seedRes.status);
    const seedData = await seedRes.json();
    console.log('Seed:', JSON.stringify(seedData, null, 2));
  } catch (e) {
    console.log('Seed error:', e.message);
  }
}

testSeededData().catch(console.error);
