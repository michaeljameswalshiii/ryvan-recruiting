@echo off
git add -A
git commit -m "Fix: Support NEXT_PUBLIC_COGNITO env vars for Vercel deployment"
npx vercel --prod
