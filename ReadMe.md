# Turnkey Optimization (RYVAN Recruiting)

Modern AI-powered recruiting CRM with resume parsing, candidate intake, fit scoring, and AI-assisted recruiting workflows.

## What this repo does

- Parses uploaded resumes and extracts structured fields for candidates
- Scores candidate-to-job fit with deterministic heuristics and resume fallback logic
- Supports recruiting CRM workflows for candidate management, outreach, and job matching
- Provides a public careers application flow and AI-powered assistive recruiting features

## AI resume reviewer capabilities

This repo already contains the core pieces of an AI resume reviewer:

- resume text extraction and parsing
- skill extraction from free text
- candidate/job fit scoring
- structured fit summary output for recruiter-facing notes

## Live Deployment

**URL**: https://turnkey-optimization.vercel.app

Credentials are **not** stored in this repository. Use your Cognito / DynamoDB profile account, or create one via the signup flow if registration is enabled.

## Quick Start

```bash
cp .env.example .env.local
# Fill in env vars (never commit .env* files with secrets)
npm install
npm run dev
```

## Reviewer smoke check

Use the built-in smoke script to validate the fit-scoring reviewer path:

```bash
npm run review:smoke
```

You can also run the resume parsing smoke test:

```bash
npm run review:resume
```

## Security

See `SECURITY_REMEDIATION.md` for the security hardening checklist and incident response steps.
