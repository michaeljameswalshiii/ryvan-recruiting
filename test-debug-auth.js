/**
 * Debug what's happening with the authentication
 * Try to trace through what happens when logging in
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

async function testDebug() {
  console.log('=== Debug Authentication Flow ===\n');
  
  // Step 1: Try to login with Ryan (known user)
  console.log('[Step 1] Login attempt with test password...');
  
  // Try a few common test passwords
  const passwords = ['TestPassword123!', 'Test1234!', 'Test123!', 'Password123!', 'TestPass1!'];
  
  for (const pw of passwords) {
    try {
      const res = await fetch(`${VERCEL_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'Ryan@ryvanrecruiting.com', password: pw }),
      });
      
      const data = await res.json();
      console.log(`Password "${pw}": ${res.status} -`, data.error || 'success');
      
      if (res.status === 200) {
        console.log('✅ Found working password!');
        break;
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
  
  console.log('\n[Step 2] Check login page to see available info...');
  
  // Fetch login page to see if there's any useful info
  const pageRes = await fetch(`${VERCEL_URL}/login`);
  console.log(`Login page status: ${pageRes.status}`);
  
  console.log('\n=== Done ===');
}

testDebug().catch(console.error);
