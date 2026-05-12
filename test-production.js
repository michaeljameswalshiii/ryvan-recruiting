/**
 * Test production deployment
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

async function testProduction() {
  console.log('=== Testing Production Deployment ===\n');
  
  // Step 1: Check if production server is up
  console.log('[Step 1] Ping production...');
  try {
    const res = await fetch(`${VERCEL_URL}/api/auth/session`, { 
      credentials: 'include' 
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Step 2: Get production environment info
  console.log('\n[Step 2] Check environment...');
  try {
    const res = await fetch(`${VERCEL_URL}/api/data/clients`, { 
      credentials: 'include' 
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  console.log('\n=== Done ===');
}

testProduction().catch(console.error);
