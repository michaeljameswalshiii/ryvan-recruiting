// Test Apollo API key - multiple header formats
const API_KEY = "***REMOVED***";

async function testApollo() {
  // Try different header formats Apollo accepts
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
      console.log("  Status:", res.status);
      console.log("  Result:", JSON.stringify(data, null, 2).substring(0, 500));
      if (data.people) break; // Success!
    } catch (err) {
      console.error("  Error:", err.message);
    }
  }
}

testApollo();
