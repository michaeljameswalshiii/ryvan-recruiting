// Test Apollo API with different header formats (env key only)
const testApollo = async () => {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("Set APOLLO_API_KEY before running this script");
    process.exit(1);
  }

  try {
    console.log("=== Testing with x-api-key header ===");
    const response = await fetch(
      "https://api.apollo.io/api/v1/organizations/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          q: "construction",
          locations: ["Boca Raton, FL"],
          organization_num_employees_ranges: ["1-500"],
          per_page: 5,
        }),
      }
    );
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Companies found:", data.organizations?.length || 0);
  } catch (e) {
    console.error("Error:", e.message);
  }
};

testApollo();
