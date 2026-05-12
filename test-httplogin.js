/**
 * Test the login flow via HTTP
 */

const API_BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = 'prodtest@test.com';
const PASSWORD = 'Test123!';

async function testLogin() {
  console.log(`Testing login at: ${API_BASE}`);
  console.log(`Email: ${EMAIL}`);
  console.log('---');

  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    console.log(`Status: ${response.status}`);
    console.log(`Status Text: ${response.statusText}`);

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    // Check for cookies
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      console.log(`Cookies: ${cookies.substring(0, 100)}...`);
    }

    return response;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

testLogin().catch(console.error);
