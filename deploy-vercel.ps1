# Deploy to Vercel script
Set-Location -Path "C:\Users\micha\Desktop\turnkey-optimization"

# First re-link to the correct project
# This will guide user through linking process if not already linked
npx vercel link --yes

# Deploy to Vercel default project
vercel deploy --prod --yes
