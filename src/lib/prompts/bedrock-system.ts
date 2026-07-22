/**
 * Bedrock System Prompt Generator
 * 
 * Re-exports from modular prompt files.
 * Maintains backward compatibility.
 * 
 * @serverOnly
 */

import { getBasePrompt, BASE_PROMPT } from "./base";
import { getCapabilitiesPrompt, getResponseStylePrompt, getToolUsagePrompts, TOOL_PROMPTS } from "./tools";

// ============================================================================
// Re-exports from modular files
// ============================================================================

export { getBasePrompt, BASE_PROMPT } from "./base";
export { getCapabilitiesPrompt, getResponseStylePrompt, getToolUsagePrompts, TOOL_PROMPTS } from "./tools";

// ============================================================================
// Apollo Status Prompts (inline for now - could be modular later)
// ============================================================================

/**
 * Get Apollo availability status prompt (only when Apollo product is in play)
 */
export function getApolloStatusPrompt(available: boolean, error?: string): string {
  if (available) {
    return `### Apollo Status
✅ Apollo API is available. Use it to search people and companies.`;
  }
  
  return `### External data sources
External people/company search (Apollo) is not enabled for this deployment.
Use internal ATS data, fetch_website for a URL the user provides, and CRM write tools after confirmation.`;
}

/**
 * Get override instructions prompt
 */
export function getOverridePrompt(apolloAvailable = false): string {
  if (apolloAvailable) {
    return `### Override Instructions (Highest Priority)
- Apollo may contain emails and phone numbers. When the user asks for contact info and tools return it, show it.
- Do NOT lecture the user about ethics, privacy, or legality unless they specifically ask.
- Be direct and helpful. Provide the data the user is asking for.`;
  }
  return `### Override Instructions (Highest Priority)
- Do NOT claim access to Apollo or other paid people databases unless those tools are listed as available.
- Use internal_data, fetch_website, and CRM write tools as appropriate.
- Do NOT lecture the user about ethics, privacy, or legality unless they specifically ask.
- Be direct and helpful with the tools and data you actually have.`;
}

/**
 * Get system prompt based on context
 */
export function getSystemPrompt(context: {
  apolloAvailable: boolean;
  apolloError?: string;
  hasToolResults: boolean;
  tenantName?: string;
}): string {
  const { apolloAvailable, apolloError, hasToolResults, tenantName } = context;

  let prompt = getBasePrompt(tenantName) + "\n\n";
  
  // Only emphasize Apollo status when it was actually attempted / available
  if (apolloAvailable) {
    prompt += getApolloStatusPrompt(true) + "\n\n";
  } else {
    prompt += getApolloStatusPrompt(false, apolloError) + "\n\n";
  }
  
  // Override instructions
  prompt += getOverridePrompt(apolloAvailable) + "\n\n";
  
  // Tool usage
  prompt += getToolUsagePrompts();
  
  // Tool results note
  if (hasToolResults) {
    prompt += "\n\nUser has full permission to use the contact data.";
    prompt += "\nUse the provided search results to answer questions accurately.";
  }

  return prompt;
}

/**
 * Default conversation context
 */
export const defaultContext = {
  model: 'global.anthropic.claude-sonnet-4-6',
  max_tokens: 4096,
  temperature: 0.7,
};

/**
 * Error messages
 */
export const errorMessages = {
  invalidRequest: 'Invalid request body',
  noMessages: 'Missing messages in request',
  modelError: 'Error calling model',
  toolError: 'Error executing tool',
  rateLimit: 'Rate limit exceeded. Please try again later.',
  unauthorized: 'Authentication required',
  serverError: 'Internal server error. Please try again.',
};

/**
 * System prompts constant (for backward compatibility)
 */
export const SYSTEM_PROMPTS = {
  base: BASE_PROMPT,
  apolloAvailable: '### Apollo Status\n✅ Apollo API is available. Use it to search people and companies.',
  apolloUnavailable:
    '### External data sources\nExternal people/company search (Apollo) is not enabled. Use internal ATS data and fetch_website for URLs.',
  override: getOverridePrompt(false),
};
