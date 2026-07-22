/**
 * Tool Usage Prompt
 *
 * Instructions for using tools (internal CRM, fetch_website, optional Apollo/Tavily).
 *
 * @serverOnly
 */

/**
 * Get capabilities prompt
 */
export function getCapabilitiesPrompt(): string {
  return `### Capabilities
- Use internal_data for candidates, companies, contacts, and jobs already in the ATS.
- Use fetch_website when the user provides a public URL to research.
- Show full contact details in clean tables when available.
- Offer to save people/companies with CRM write tools after confirming with the user.
- Do not invent access to external people databases (e.g. Apollo) unless that tool is enabled.`;
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
- Use internal_data for candidates, companies, contacts, and jobs already in the ATS.
- Use fetch_website when the user provides a public URL to research.
- Show full contact details in clean tables when available.
- Offer to save people/companies with CRM write tools after confirming with the user.
- Do not invent access to external people databases (e.g. Apollo) unless that tool is enabled.`,
  style: `### Response Style
- Be concise, direct, and action-focused.
- Lead with the data.
- Use markdown tables.
- If data is limited, offer to try different search parameters.`,
};
