# Commit and deploy to Vercel
cd ..\TurnkeyOptimization

# Commit changes
git add -A
git commit -m "Add Candidates page with database save - fix Apollo API endpoints"

# Deploy to Vercel production
npx vercel --prod --yes
