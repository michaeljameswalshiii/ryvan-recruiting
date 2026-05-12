# MCP Implementation TODO

## Task: Upgrade to Claude Sonnet 4.6 with Native MCP Tool Calling

### Plan:
1. Update DEFAULT_MODEL to global.anthropic.claude-sonnet-4-6
2. Add anthropic_version, tools, tool_choice to Bedrock API calls
3. Replace executeToolsForQuery() with MCP agent loop
4. Test

### Files to Edit:
- [x] Plan created
- [x] src/app/api/bedrock/route.ts - Main implementation
- [x] src/lib/prompts/bedrock-system.ts - Update model reference
- [x] Test locally

### Implementation Complete:
- [x] Updated model to global.anthropic.claude-sonnet-4-6
- [x] Added anthropic_version to request body
- [x] Added tools and tool_choice for native tool calling
- [x] Created runMCPAgent() function with agent loop
- [x] Updated invokeClaude() to support tools
- [x] Added executeToolByName() for tool execution
- [x] Simplified response (no pre-scripted tool execution)
