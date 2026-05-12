/**
 * Test the production Vercel deployment
 */

// Test production URL
const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

console.log('=== Testing Vercel Production Deployment ===');
console.log(`URL: ${VERCEL_URL}`);
console.log('');

async function testProduction() {
  // Test 1: Check if server is responding
  console.log('[Test 1] Ping the server...');
  try {
    const response = await fetch(VERCEL_URL, { method: 'HEAD' });
    console.log(`Status: ${response.status}`);
  } catch (error) {
    console.error('Server not reachable:', error.message);
  }

  console.log('');

  // Test 2: Check login endpoint
  console.log('[Test 2] Test login API...');
  try {
    const response = await fetch(`${VERCEL_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'prodtest@test.com', password: 'Test123!' }),
    });
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Login failed:', error.message);
  }

  console.log('');

  // Test 3: Check session endpoint
  console.log('[Test 3] Test session API...');
  try {
    const response = await fetch(`${VERCEL_URL}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
    });
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Session check failed:', error.message);
  }
}

testProduction().catch(console.error);
