// Test Apollo API
const testApollo = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/apollo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'AWS developer',
        per_page: 5,
        location: 'Jacksonville Beach, FL'
      })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
};

testApollo();
