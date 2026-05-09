// Test Bedrock API on production with sourcing query
const testBedrock = async () => {
  try {
    const response = await fetch('https://turnkey-optimization.vercel.app/api/bedrock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Find me a Python developer in Miami' }
        ],
        useSearch: true
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data.response?.substring(0, 800) || data.error || JSON.stringify(data));
    console.log('---');
    console.log('Apollo Used:', data.apolloUsed);
    console.log('Apollo Available:', data.apolloAvailable);
    console.log('Apollo Error:', data.apolloError);
    console.log('Search Used:', data.searchUsed);
  } catch (e) {
    console.error('Error:', e.message);
  }
};

testBedrock();
