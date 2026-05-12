/**
 * Test login with Ryan user - the main admin user
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';
const EMAIL = 'Ryan@ryvanrecruiting.com';
// Need to find the password - let's check if there's any test files mentioning it
const PASSWORD = 'Test123!'; // Will try default

console.log('=== Testing Ryan Login ===');
console.log(`Email: ${EMAIL}`);
console.log('');

async function testRyanLogin() {
  // Try logging in
  console.log('[Step 1] Login...');
  const loginRes = await fetch(`${VERCEL_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  console.log(`Status: ${loginRes.status}`);
  const loginData = await loginRes.json();
  console.log('Response:', JSON.stringify(loginData, null, 2));
}

testRyanLogin().catch(console.error);
