22:49:03.664 Running build in Washington, D.C., USA (East) – iad1
22:49:03.665 Build machine configuration: 4 cores, 8 GB
22:49:03.815 Cloning github.com/michaeljameswalshiii/turnkey-optimization (Branch: master, Commit: 21f7e0c)
22:49:04.161 Warning: Failed to fetch one or more git submodules
22:49:04.162 Cloning completed: 346.000ms
22:49:04.241 Found .vercelignore
22:49:04.287 Removed 95 ignored files defined in .vercelignore
22:49:04.288   /AI_APOLLO_IMPORT_GUIDE.md
22:49:04.288   /AWS_QUICKSIGHT_REPORTING_SETUP.md
22:49:04.288   /BEDROCK_USAGE_SETUP.md
22:49:04.288   /cdk/__init__.py
22:49:04.288   /cdk/app.py
22:49:04.289   /cdk/cdk.json
22:49:04.289   /cdk/cdk.out/cdk.out
22:49:04.289   /cdk/cdk.out/manifest.json
22:49:04.289   /cdk/cdk.out/tree.json
22:49:04.289   /cdk/cdk.out/TurnkeyAuth.assets.json
22:49:05.534 Restored build cache from previous deployment (7xZbDtaiayzwy3hqcsAgkjN1QcT6)
22:49:05.748 Running "vercel build"
22:49:05.764 Vercel CLI 55.0.0
22:49:06.164 Running "install" command: `npm install`...
22:49:13.770 
22:49:13.770 up to date, audited 694 packages in 7s
22:49:13.770 
22:49:13.770 195 packages are looking for funding
22:49:13.771   run `npm fund` for details
22:49:13.879 
22:49:13.879 3 vulnerabilities (1 moderate, 1 high, 1 critical)
22:49:13.879 
22:49:13.879 To address all issues (including breaking changes), run:
22:49:13.879   npm audit fix --force
22:49:13.879 
22:49:13.880 Run `npm audit` for details.
22:49:13.931 Detected Next.js version: 15.1.11
22:49:13.932 Running "npm run build"
22:49:14.044 
22:49:14.044 > turnkey-optimization@0.1.0 build
22:49:14.044 > next build
22:49:14.044 
22:49:14.891    ▲ Next.js 15.1.11
22:49:14.891    - Environments: .env.production
22:49:14.891 
22:49:14.912    Creating an optimized production build ...
22:49:28.745 Failed to compile.
22:49:28.746 
22:49:28.746 ./src/components/EventTimeline.tsx
22:49:28.746 Error:   x Unexpected token `div`. Expected jsx identifier
22:49:28.746      ,-[/vercel/path0/src/components/EventTimeline.tsx:276:1]
22:49:28.746  273 |   }
22:49:28.746  274 | 
22:49:28.747  275 |   return (
22:49:28.747  276 |     <div className="border border-border rounded-lg bg-background overflow-hidden">
22:49:28.747      :      ^^^
22:49:28.747  277 |       <div className="border-b border-border p-4">
22:49:28.747  278 |         <h3 className="text-lg font-semibold">Category</h3>
22:49:28.747  279 |         <p className="text-sm text-muted-foreground">
22:49:28.747      `----
22:49:28.747 
22:49:28.748 Caused by:
22:49:28.748     Syntax Error
22:49:28.748 
22:49:28.748 Import trace for requested module:
22:49:28.748 ./src/components/EventTimeline.tsx
22:49:28.748 ./src/app/dashboard/jobs/[id]/page.tsx
22:49:28.748 
22:49:28.752 
22:49:28.752 > Build failed because of webpack errors
22:49:28.790 Error: Command "npm run build" exited with 1
