/**
 * Test production /api/data/clients endpoint
 */

const API_BASE = "https://turnkey-optimization.vercel.app";

async function testClientsAPI() {
  console.log('=== Testing Production /api/data/clients ===\n');

  // Try GET first - requires session cookie
  console.log('[Step 1] GET /api/data/clients');
  try {
    const getResponse = await fetch(`${API_BASE}/api/data/clients`, {
      credentials: 'include',
    });
    console.log(`Status: ${getResponse.status}`);
    const getData = await getResponse.json();
    console.log('Response:', JSON.stringify(getData, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n[Step 2] POST /api/data/clients (create)');
  try {
    const postResponse = await fetch(`${API_BASE}/api/data/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: 'Test Company API',
        email: 'test@test.com',
        industry: 'Technology',
      }),
    });
    console.log(`Status: ${postResponse.status}`);
    const postData = await postResponse.json();
    console.log('Response:', JSON.stringify(postData, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== Done ===');
}

testClientsAPI().catch(console.error);
