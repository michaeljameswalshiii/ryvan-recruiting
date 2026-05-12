// Test Apollo API directly
const https = require('https');

const apiKey = process.env.APOLLO_API_KEY || '***REMOVED***';
console.log('Testing with API key:', apiKey.substring(0, 5) + '...');

const data = JSON.stringify({
  q: 'AWS developer',
  per_page: 5
});

const options = {
  hostname: 'api.apollo.io',
  path: '/api/v1/people/search',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(body);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response:', body);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
