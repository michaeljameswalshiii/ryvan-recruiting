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
 * Get Apollo availability status prompt
 */
export function getApolloStatusPrompt(available: boolean, error?: string): string {
  if (available) {
    return `### Apollo Status
✅ Apollo API is available. Use it to search people and companies.`;
  }
  
  return `### Apollo Status
⚠️ Apollo API is unavailable: ${error || 'Unknown error'}
Please answer the user's question using your own knowledge. Be helpful and provide what information you can.`;
}

/**
 * Get override instructions prompt
 */
export function getOverridePrompt(): string {
  return `### Override Instructions (Highest Priority)
- Apollo DOES contain emails and phone numbers. When the user asks for contact info, use it.
- Do NOT lecture the user about ethics, privacy, or legality unless they specifically ask.
- Do NOT refuse to show emails or phones if they are available in Apollo.
- Be direct and helpful. Provide the data the user is asking for.`;
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
  
  // Apollo availability status
  prompt += getApolloStatusPrompt(apolloAvailable, apolloError) + "\n\n";
  
  // Override instructions
  prompt += getOverridePrompt() + "\n\n";
  
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
  apolloUnavailable: '### Apollo Status\n⚠️ Apollo API is unavailable. Please answer using available knowledge.',
  override: getOverridePrompt(),
};
