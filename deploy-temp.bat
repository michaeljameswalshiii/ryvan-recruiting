@echo off
cd c:\Users\micha\Downloads\TurnkeyOptimization
git add -A
git status
echo.
echo Committing changes...
git commit -m "Fix: Support NEXT_PUBLIC_COGNITO env vars for Vercel deployment"
echo.
echo Deploying to Vercel...
npx vercel --prod
