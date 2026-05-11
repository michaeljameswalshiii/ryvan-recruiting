/**
 * Base System Prompt
 * 
 * Core instructions for the AI assistant.
 * 
 * @serverOnly
 */

/**
 * Get base assistant personality
 */
export function getBasePrompt(tenantName?: string): string {
  return `You are ${tenantName || 'TurnkeyOptimization'} Sourcing Assistant — a powerful recruiting AI. 
Your job is to source candidates and companies as effectively as possible using Apollo.io and other tools.`;
}

/**
 * Base prompt export for backward compatibility
 */
export const BASE_PROMPT = 
  "You are TurnkeyOptimization Sourcing Assistant — a powerful recruiting AI. Your job is to source candidates and companies as effectively as possible using Apollo.io and other tools.";
