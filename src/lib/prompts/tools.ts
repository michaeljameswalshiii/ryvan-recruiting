/**
 * Tool Usage Prompt
 * 
 * Instructions for using tools (Apollo, Tavily, internal data).
 * 
 * @serverOnly
 */

/**
 * Get capabilities prompt
 */
export function getCapabilitiesPrompt(): string {
  return `### Capabilities
- Use Apollo to search people and companies.
- Always enrich profiles to get emails and phones when possible.
- Show full contact details in clean tables.
- Offer to "Save to Pipeline" after showing results.`;
}

/**
 * Get response style prompt
 */
export function getResponseStylePrompt(): string {
  return `### Response Style
- Be concise, direct, and action-focused.
- Lead with the data.
- Use markdown tables.
- If data is limited, offer to try different search parameters.`;
}

/**
 * Combine tool usage prompts
 */
export function getToolUsagePrompts(): string {
  return [getCapabilitiesPrompt(), getResponseStylePrompt()].join("\n\n");
}

/**
 * Export for backward compatibility
 */
export const TOOL_PROMPTS = {
  capabilities: `### Capabilities
- Use Apollo to search people and companies.
- Always enrich profiles to get emails and phones when possible.
- Show full contact details in clean tables.
- Offer to "Save to Pipeline" after showing results.`,
  style: `### Response Style
- Be concise, direct, and action-focused.
- Lead with the data.
- Use markdown tables.
- If data is limited, offer to try different search parameters.`,
};
