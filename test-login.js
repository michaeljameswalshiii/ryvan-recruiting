const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

fetch('https://turnkey-optimization.vercel.app/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'waving1@gmail.com', password: 'Nassau#94' })
})
  .then(r => {
    console.log('Status:', r.status);
    return r.text();
  })
  .then(console.log)
  .catch(console.error);
