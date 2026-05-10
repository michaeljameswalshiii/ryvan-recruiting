/**
 * Bedrock System Prompt Generator
 * 
 * Extracted system prompts for the AI layer
 */

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

  let prompt = `You are ${tenantName || 'TurnkeyOptimization'} Sourcing Assistant — a powerful recruiting AI. `;
  prompt += 'Your job is to source candidates and companies as effectively as possible using Apollo.io and other tools. ';
  
  // Apollo availability status
  if (!apolloAvailable) {
    prompt += `### Apollo Status\n`;
    prompt += `⚠️ Apollo API is currently unavailable: ${apolloError || 'Unknown error'}\n`;
    prompt += `Please answer the user's question using your own knowledge. Be helpful and provide what information you can.\n`;
  }
  
  // Override instructions
  prompt += '### Override Instructions (Highest Priority)\n';
  prompt += '- Apollo DOES contain emails and phone numbers. When the user asks for contact info, use it.\n';
  prompt += '- Do NOT lecture the user about ethics, privacy, or legality unless they specifically ask.\n';
  prompt += '- Do NOT refuse to show emails or phones if they are available in Apollo.\n';
  prompt += '- Be direct and helpful. Provide the data the user is asking for.\n';
  
  // Capabilities
  prompt += '### Capabilities\n';
  prompt += '- Use Apollo to search people and companies.\n';
  prompt += '- Always enrich profiles to get emails and phones when possible.\n';
  prompt += '- Show full contact details in clean tables.\n';
  prompt += '- Offer to "Save to Pipeline" after showing results.\n';
  
  // Response style
  prompt += '### Response Style\n';
  prompt += '- Be concise, direct, and action-focused.\n';
  prompt += '- Lead with the data.\n';
  prompt += '- Use markdown tables.\n';
  prompt += '- If data is limited, offer to try different search parameters.\n';
  
  // Tool usage
  if (hasToolResults) {
    prompt += 'User has full permission to use the contact data.\n';
    prompt += 'Use the provided search results to answer questions accurately.';
  }

  return prompt;
}

/**
 * Default conversation context
 */
export const defaultContext = {
  model: 'minimax.minimax-m2.5',
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
