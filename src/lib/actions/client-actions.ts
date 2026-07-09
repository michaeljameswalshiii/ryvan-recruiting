13:49:47.070 Running build in Washington, D.C., USA (East) – iad1
13:49:47.070 Build machine configuration: 4 cores, 8 GB
13:49:47.170 Cloning github.com/michaeljameswalshiii/turnkey-optimization (Branch: master, Commit: 5750a0e)
13:49:47.497 Warning: Failed to fetch one or more git submodules
13:49:47.498 Cloning completed: 327.000ms
13:49:47.570 Found .vercelignore
13:49:47.599 Removed 95 ignored files defined in .vercelignore
13:49:47.599   /AI_APOLLO_IMPORT_GUIDE.md
13:49:47.599   /AWS_QUICKSIGHT_REPORTING_SETUP.md
13:49:47.599   /BEDROCK_USAGE_SETUP.md
13:49:47.599   /cdk/__init__.py
13:49:47.600   /cdk/app.py
13:49:47.600   /cdk/cdk.json
13:49:47.600   /cdk/cdk.out/cdk.out
13:49:47.600   /cdk/cdk.out/manifest.json
13:49:47.600   /cdk/cdk.out/tree.json
13:49:47.600   /cdk/cdk.out/TurnkeyAuth.assets.json
13:49:48.995 Restored build cache from previous deployment (8esU6bQ6NJxgiGghbzEr66ShbGCQ)
13:49:49.225 Running "vercel build"
13:49:49.336 Vercel CLI 54.21.1
13:49:49.739 Running "install" command: `npm install`...
13:49:57.622 
13:49:57.622 up to date, audited 694 packages in 8s
13:49:57.623 
13:49:57.623 195 packages are looking for funding
13:49:57.623   run `npm fund` for details
13:49:57.730 
13:49:57.730 3 vulnerabilities (1 moderate, 1 high, 1 critical)
13:49:57.730 
13:49:57.731 To address all issues (including breaking changes), run:
13:49:57.731   npm audit fix --force
13:49:57.731 
13:49:57.731 Run `npm audit` for details.
13:49:57.778 Detected Next.js version: 15.1.11
13:49:57.778 Running "npm run build"
13:49:57.886 
13:49:57.886 > turnkey-optimization@0.1.0 build
13:49:57.887 > next build
13:49:57.887 
13:49:58.758    ▲ Next.js 15.1.11
13:49:58.758    - Environments: .env.production
13:49:58.758 
13:49:58.779    Creating an optimized production build ...
13:50:13.315 Failed to compile.
13:50:13.316 
13:50:13.316 ./src/lib/actions/client-actions.ts
13:50:13.317 Error:   x Expression expected
13:50:13.317     ,-[/vercel/path0/src/lib/actions/client-actions.ts:50:1]
13:50:13.317  47 | 
13:50:13.317  48 | export async function addContactAction(clientId: string, contactData: any) {
13:50:13.317  49 |   // Your improved version
13:50:13.317  50 |   const result = await addContactToClient(/* tenantId logic */, clientId, contactData);
13:50:13.318     :                                                               ^
13:50:13.318  51 |   // ... 
13:50:13.318  52 | }
13:50:13.318     `----
13:50:13.318 
13:50:13.318 Caused by:
13:50:13.318     Syntax Error
13:50:13.319 
13:50:13.319 Import trace for requested module:
13:50:13.319 ./src/lib/actions/client-actions.ts
13:50:13.319 ./src/app/dashboard/contact-info/page.tsx
13:50:13.320 
13:50:13.320 ./src/lib/actions/client-actions.ts
13:50:13.320 Error:   x Expression expected
13:50:13.320     ,-[/vercel/path0/src/lib/actions/client-actions.ts:50:1]
13:50:13.320  47 | 
13:50:13.320  48 | export async function addContactAction(clientId: string, contactData: any) {
13:50:13.321  49 |   // Your improved version
13:50:13.321  50 |   const result = await addContactToClient(/* tenantId logic */, clientId, contactData);
13:50:13.321     :                                                               ^
13:50:13.321  51 |   // ... 
13:50:13.321  52 | }
13:50:13.321     `----
13:50:13.322 
13:50:13.322 Caused by:
13:50:13.322     Syntax Error
13:50:13.322 
13:50:13.322 Import trace for requested module:
13:50:13.322 ./src/lib/actions/client-actions.ts
13:50:13.322 ./src/app/dashboard/contacts/[contactId]/page.tsx
13:50:13.322 
13:50:13.323 
13:50:13.324 > Build failed because of webpack errors
13:50:13.364 Error: Command "npm run build" exited with 1
