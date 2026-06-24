# GO.md - Developer Guidelines

## Purpose
This file documents best practices and workflows to ensure consistent, high-quality development across sessions. All AI agents should reference this file before making code decisions.

## Core Principles

### 1. Read Before Acting
- Before any task, analyze the full repo context including:
  - All MD files in the root directory (TODO.md, Project_Goals.md, EVENTS_ARCHITECTURE.md, etc.)
  - Relevant source files for the specific change
  - Existing patterns in the codebase
- Review environment_details for project structure overview

### 2. Understand Project Goals
- Reference `Project_Goals.md` for the north star vision
- Reference `EVENTS_ARCHITECTURE.md` for event handling patterns
- Reference `TODO.md` for active tasks

### 3. Multi-Agent Approach
- For complex features, use multiple agents in parallel
- Always run at least 2-3 agents for critical code
- Use Chairman/Reviewer pattern for merge decisions

### 4. Code Quality Standards
- TypeScript strict mode on all new code
- Proper error handling required
- Tenant isolation mandatory on every change
- Add/update tests or manual verification steps
- Temperature 0.0-0.3 for deterministic code generation

### 5. Branching & Commit Rules
- Feature branches: prefix with `m2.7/` or `blackbox/`
- Human review before merging to main
- Descriptive commit messages

## Workflow Steps

### Before Making Changes
1. List and read relevant MD files
2. Read the specific source files to modify
3. Understand existing patterns
4. Create a plan and confirm with user

### During Development
1. Make surgical, focused edits
2. Test locally when possible
3. commit frequently with descriptive messages

### After Changes
1. Verify build passes (`npm run build`)
2. Test the specific functionality
3. Push and notify user of results

## Key References
- `Project_Goals.md` - Vision and target users
- `EVENTS_ARCHITECTURE.md` - Event logging patterns
- `TODO.md` - Active tasks
- `TURNKEY_OPTIMIZATION_PLAN.md` - Feature roadmap

---

*Last Updated*: May 2025
