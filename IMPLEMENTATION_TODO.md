# MCP Implementation TODO

## Task: Change Default Model to Claude Sonnet 4.6 + Emulate MCP Behavior with Apollo

### Steps:

- [ ] 1. Update `/src/app/api/bedrock/route.ts` - Major rewrite with MCP-style agent loop
  - [ ] Change DEFAULT_MODEL to Claude Sonnet 4.6
  - [ ] Add model selection logic (Sonnet default, Haiku cheap, Opus heavy)
  - [ ] Implement MCP-style planning → execution → reflection
  - [ ] Add persistent conversation context
  - [ ] Add parallel tool execution
  - [ ] Add structured output for recruiting workflows

- [ ] 2. Update `/src/lib/prompts/bedrock-system.ts` - System prompts for Claude
  - [ ] Update SYSTEM_PROMPTS for Claude models
  - [ ] Add MCP-specific prompts

- [ ] 3. Update `/src/lib/prompts/base.ts` - Base prompt update
  - [ ] Update for Claude Sonnet 4.6

- [ ] 4. Update `/src/lib/ai/tools/index.ts` - Tool schemas
  - [ ] Update for Claude compatibility

- [ ] 5. Update `/src/app/api/apollo/route.ts` - Model consistency
  - [ ] Update to use Sonnet as default

- [ ] 6. Update `/src/app/dashboard/ai-assistant/page.tsx` - UI model indicator
  - [ ] Update to show Claude Sonnet 4.6

---

## Completion Checkpoint:
- [ ] All files updated with Claude Sonnet 4.6 as default
- [ ] MCP-style agent loop implemented in bedrock route
- [ ] Dev server restart tested
- [ ] All flows tested
