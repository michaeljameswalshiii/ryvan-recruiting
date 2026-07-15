// Smoke-test login against local or deployed app.
// Usage:
//   LOGIN_EMAIL=you@example.com LOGIN_PASSWORD=secret node test-login.js
//   optional: LOGIN_URL=https://turnkey-optimization.vercel.app/api/auth/login

const email = process.env.LOGIN_EMAIL;
const password = process.env.LOGIN_PASSWORD;
const url =
  process.env.LOGIN_URL || "http://localhost:3000/api/auth/login";

if (!email || !password) {
  console.error("Set LOGIN_EMAIL and LOGIN_PASSWORD env vars");
  process.exit(1);
}

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
})
  .then(async (res) => {
    console.log("Status:", res.status);
    console.log(await res.text());
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
