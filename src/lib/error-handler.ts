/**
 * Centralized Error Handler
 * Provides consistent, user-friendly error messages
 * Never leaks technical details to users
 * 
 * @serverOnly - Use in server actions and API routes
 * @clientOnly - Use in client components
 */

/**
 * Error types for different scenarios
 */
export enum ErrorType {
  UNAUTHORIZED = 'unauthorized',
  NOT_FOUND = 'not_found',
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  SERVER = 'server',
  NETWORK = 'network',
  UNKNOWN = 'unknown',
}

/**
 * User-friendly error messages
 * Maps technical errors to messages safe for users
 */
export const errorMessages: Record<ErrorType, string> = {
  [ErrorType.UNAUTHORIZED]: 'Please log in to continue',
  [ErrorType.NOT_FOUND]: 'The requested item was not found',
  [ErrorType.VALIDATION]: 'Please check your input and try again',
  [ErrorType.RATE_LIMIT]: 'Too many requests. Please wait a moment',
  [ErrorType.SERVER]: 'Something went wrong. Please try again later',
  [ErrorType.NETWORK]: 'Connection problem. Please check your internet',
  [ErrorType.UNKNOWN]: 'An unexpected error occurred',
};

/**
 * Determine error type from error message or status code
 */
export function getErrorType(error: unknown, statusCode?: number): ErrorType {
  // Handle HTTP status codes
  if (statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      return ErrorType.UNAUTHORIZED;
    }
    if (statusCode === 404) {
      return ErrorType.NOT_FOUND;
    }
    if (statusCode === 429) {
      return ErrorType.RATE_LIMIT;
    }
    if (statusCode >= 500) {
      return ErrorType.SERVER;
    }
  }

  // Handle error message patterns
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('access token')) {
    return ErrorType.UNAUTHORIZED;
  }
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return ErrorType.NOT_FOUND;
  }
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid input')) {
    return ErrorType.VALIDATION;
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return ErrorType.RATE_LIMIT;
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return ErrorType.NETWORK;
  }
  if (lowerMessage.includes('server') || lowerMessage.includes('internal')) {
    return ErrorType.SERVER;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Get user-friendly error message
 * Never exposes technical details
 */
export function getUserMessage(error: unknown, statusCode?: number): string {
  const errorType = getErrorType(error, statusCode);
  return errorMessages[errorType];
}

/**
 * Log error for developers (server-side only)
 * This can be connected to logging services like Sentry
 */
export function logError(context: string, error: unknown): void {
  // In production, this would send to a logging service
  // For now, we log to console with context
  console.error(`[ERROR:${context}]`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a standardized error response
 * Used in server actions and API routes
 */
export function createErrorResponse(error: unknown, statusCode?: number) {
  const userMessage = getUserMessage(error, statusCode);
  
  // Log the actual error for debugging
  logError('server_action', error);

  return {
    error: userMessage,
    // Include a generic error code for tracing
    // In production, this would be a unique ID
    code: 'ERROR',
  };
}

/**
 * Handle form validation errors
 * Extracts Zod validation errors into user-friendly messages
 */
export function handleValidationError(validationResult: {
  success: boolean;
  error?: {
    flatten: () => Record<string, string[]>;
  };
}): string {
  if (validationResult.success) {
    return '';
  }

  const errors = validationResult.error?.flatten();
  if (!errors) {
    return errorMessages[ErrorType.VALIDATION];
  }

  // Get first field with errors
  const firstField = Object.keys(errors)[0];
  if (firstField && errors[firstField]?.length > 0) {
    return `${firstField}: ${errors[firstField][0]}`;
  }

  return errorMessages[ErrorType.VALIDATION];
}

/**
 * Client-side error handler
 * Provides safe error messages for UI display
 */
'use client';

import { toast } from 'sonner';

/**
 * Handle async operation errors with toast notification
 */
export async function handleAsyncError<T>(
  operation: () => Promise<T>,
  options?: {
    successMessage?: string;
    errorTitle?: string;
  }
): Promise<T> {
  try {
    const result = await operation();
    
    if (options?.successMessage) {
      toast.success(options.successMessage);
    }
    
    return result;
  } catch (error) {
    const message = getUserMessage(error);
    toast.error(options?.errorTitle || 'Error', {
      description: message,
    });
    throw error;
  }
}

/**
 * Wrap a server action with error handling and toast
 */
export function withErrorToast<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options?: {
    successMessage?: string;
    errorTitle?: string;
  }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      const result = await action(...args);
      
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      
      return result;
    } catch (error) {
      const message = getUserMessage(error);
      toast.error(options?.errorTitle || 'Error', {
        description: message,
      });
      throw error;
    }
  }) as T;
}
