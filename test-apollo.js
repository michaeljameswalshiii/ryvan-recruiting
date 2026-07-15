// Test Apollo API key — reads from env only (never hard-code keys)
const API_KEY = process.env.APOLLO_API_KEY;

if (!API_KEY) {
  console.error("Set APOLLO_API_KEY before running this script");
  process.exit(1);
}

async function testApollo() {
  const headers = [
    { "Api-Key": API_KEY },
    { "x-api-key": API_KEY },
    { "apollo-api-key": API_KEY },
  ];

  for (const h of headers) {
    console.log("Trying header:", Object.keys(h)[0]);
    try {
      const res = await fetch("https://api.apollo.io/api/v1/people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ q: "software engineer", per_page: 1 }),
      });
      const data = await res.json();
      console.log("Status:", res.status, "keys:", Object.keys(data));
    } catch (e) {
      console.error(e);
    }
  }
}

testApollo();
