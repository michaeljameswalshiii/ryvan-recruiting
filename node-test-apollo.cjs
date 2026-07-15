// Test Apollo API directly — requires APOLLO_API_KEY in environment
const https = require("https");

const apiKey = process.env.APOLLO_API_KEY;
if (!apiKey) {
  console.error("Set APOLLO_API_KEY before running this script");
  process.exit(1);
}
console.log("Testing with API key:", apiKey.substring(0, 4) + "...");

const data = JSON.stringify({
  q: "AWS developer",
  per_page: 5,
});

const options = {
  hostname: "api.apollo.io",
  path: "/api/v1/people/search",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length,
    "x-api-key": apiKey,
  },
};

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log(body.slice(0, 500));
  });
});
req.on("error", (e) => console.error(e));
req.write(data);
req.end();
