// Test Tavily API
const https = require('https');

const url = new URL('https://turnkey-optimization-kxz6tx4hj-michaeljameswalshiiis-projects.vercel.app/api/tavily');
const data = JSON.stringify({ query: 'test' });

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();

console.log('Request sent');
