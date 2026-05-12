/**
 * Test login with cookies preserved
 * This script simulates a browser session
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

async function testLoginWithSession() {
  // Create a cookie jar to store cookies
  const cookieJar = [];

  console.log('=== Test Login with Session Cookies ===');
  console.log('');

  // Step 1: Login
  console.log('[Step 1] Logging in...');
  const loginResponse = await fetch(`${VERCEL_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important: include cookies
    body: JSON.stringify({ email: 'prodtest@test.com', password: 'Test123!' }),
  });

  console.log(`Status: ${loginResponse.status}`);
  const loginData = await loginResponse.json();
  console.log('Response:', JSON.stringify(loginData, null, 2));

  // Capture the session cookie
  const setCookie = loginResponse.headers.get('set-cookie');
  if (setCookie) {
    console.log('Cookie:', setCookie.substring(0, 100) + '...');
    cookieJar.push(setCookie.split(';')[0]);
  }

  console.log('');

  // Step 2: Check session with cookie
  console.log('[Step 2] Checking session...');
  const sessionResponse = await fetch(`${VERCEL_URL}/api/auth/session`, {
    method: 'GET',
    credentials: 'include',
    headers: cookieJar.length > 0 ? { 'Cookie': cookieJar.join('; ') } : {},
  });

  console.log(`Status: ${sessionResponse.status}`);
  const sessionData = await sessionResponse.json();
  console.log('Response:', JSON.stringify(sessionData, null, 2));

  console.log('');

  // Step 3: Add a company
  console.log('[Step 3] Adding a company...');
  const companyResponse = await fetch(`${VERCEL_URL}/api/data/clients`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookieJar.join('; '),
    },
    credentials: 'include',
    body: JSON.stringify({
      name: 'Test Company Added',
      domain: 'testcompany.com',
      industry: 'Technology',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      employee_count: 100,
      revenue: '$10M-$25M',
      description: 'A test company added via API',
    }),
  });

  console.log(`Status: ${companyResponse.status}`);
  const companyData = await companyResponse.json();
  console.log('Response:', JSON.stringify(companyData, null, 2));

  console.log('');

  // Step 4: Get companies
  console.log('[Step 4] Getting companies...');
  const getClientsResponse = await fetch(`${VERCEL_URL}/api/data/clients`, {
    method: 'GET',
    headers: cookieJar.length > 0 ? { 'Cookie': cookieJar.join('; ') } : {},
    credentials: 'include',
  });

  console.log(`Status: ${getClientsResponse.status}`);
  const getClientsData = await getClientsResponse.json();
  console.log('Response:', JSON.stringify(getClientsData, null, 2));
}

testLoginWithSession().catch(console.error);
