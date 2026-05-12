// Test Apollo API with different header formats
const testApollo = async () => {
  // Try with x-api-key header (like /api/apollo server route)
  try {
    console.log('=== Testing with x-api-key header ===');
    const response = await fetch('https://api.apollo.io/api/v1/organizations/search', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': '***REMOVED***'
      },
      body: JSON.stringify({
        q: 'construction',
        locations: ['Boca Raton, FL'],
        organization_num_employees_ranges: ['1-500'],
        per_page: 5
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Companies found:', data.organizations?.length || 0);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
};

testApollo();
