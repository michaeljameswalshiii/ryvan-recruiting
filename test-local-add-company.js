/**
 * Test add company flow on local dev server
 */

const LOCAL_URL = 'http://localhost:3000';

async function testLocalFlow() {
  console.log('=== Testing Add Company Flow (Local) ===\n');
  
  // Step 1: Check if server is running
  console.log('[Step 1] Checking if server is running...');
  try {
    const pingRes = await fetch(`${LOCAL_URL}/api/auth/session`, { credentials: 'include' });
    console.log(`Session check: ${pingRes.status}`);
    const session = await pingRes.json();
    console.log('Session:', JSON.stringify(session, null, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
    console.log('Server may not be running. Start it with: npm run dev');
    return;
  }
  
  // Step 2: Login to get session (if not already logged in)
  console.log('\n[Step 2] Try to get session...');
  const sessionRes = await fetch(`${LOCAL_URL}/api/auth/session`, { 
    credentials: 'include' 
  });
  const sessionData = await sessionRes.json();
  
  if (sessionData.user) {
    console.log(`✅ Logged in as: ${sessionData.user.email}`);
    console.log(`Tenant ID: ${sessionData.user.tenantId || '(none)'}`);
  } else {
    console.log('Not logged in - need to login via browser');
  }
  
  // Step 3: Try to get clients (should work if logged in)
  console.log('\n[Step 3] Get clients...');
  const clientsRes = await fetch(`${LOCAL_URL}/api/data/clients`, { 
    credentials: 'include' 
  });
  console.log(`Status: ${clientsRes.status}`);
  const clientsData = await clientsRes.json();
  console.log('Clients count:', clientsData.clients?.length || 0);
  
  // Step 4: Try to add a company
  console.log('\n[Step 4] Add a new company...');
  const newCompany = {
    name: 'Test Company ' + Date.now(),
    domain: 'testcompany.com',
    industry: 'Technology',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    employee_count: 100,
    revenue: '$10M-$25M',
    description: 'Test company added from automated test',
  };
  
  const createRes = await fetch(`${LOCAL_URL}/api/data/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(newCompany),
  });
  
  console.log(`Status: ${createRes.status}`);
  const createData = await createRes.json();
  console.log('Response:', JSON.stringify(createData, null, 2));
  
  // Step 5: Check if company was added
  console.log('\n[Step 5] Verify company was added...');
  const clientsRes2 = await fetch(`${LOCAL_URL}/api/data/clients`, { 
    credentials: 'include' 
  });
  const clientsData2 = await clientsRes2.json();
  console.log('New clients count:', clientsData2.clients?.length || 0);
  
  console.log('\n=== Done ===');
}

testLocalFlow().catch(console.error);
