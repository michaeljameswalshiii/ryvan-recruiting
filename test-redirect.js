// Test routes for redirect issues
const urls = [
  'http://localhost:3000/',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/login',
  'http://localhost:3000/dashboard/ai-assistant'
];

async function testRoutes() {
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const status = res.status;
      const location = res.headers.get('location');
      console.log(`${url} => ${status}${location ? ' (redirects to ' + location + ')' : ''}`);
    } catch (e) {
      console.log(`${url} => ERROR: ${e.message}`);
    }
  }
}

testRoutes();
