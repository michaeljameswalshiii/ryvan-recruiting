// Test Apollo API on production
const testApollo = async () => {
  try {
    const response = await fetch('https://turnkey-optimization.vercel.app/api/apollo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Python developer',
        per_page: 3,
        location: 'Miami, FL'
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
};

testApollo();
