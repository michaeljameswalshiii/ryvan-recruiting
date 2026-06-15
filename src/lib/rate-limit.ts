/**
 * Simple In-Memory Rate Limiter
 * 
 * For production, use Upstash Redis or Vercel KV.
 * This simple version works for single-instance deployments.
 * 
 * @serverOnly
 */

// In-memory store (resets on server restart)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute

/**
 * Check if a request should be rate limited
 * 
 * @param key - Unique identifier (e.g., IP address, user ID, or tenant ID)
 * @returns { allowed: boolean; remaining: number; resetAt: number }
 */
export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    // New window - reset count
    requestCounts.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Rate limited
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetTime,
    };
  }
  
  // Increment count
  record.count++;
  
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - record.count,
    resetAt: record.resetTime,
  };
}

/**
 * Get rate limit info without incrementing (for checking before auth)
 */
export function getRateLimitStatus(key: string): {
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    return {
      remaining: RATE_LIMIT_MAX_REQUESTS,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }
  
  return {
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count),
    resetAt: record.resetTime,
  };
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ============================================================================
// Headers Helper
// ============================================================================

/**
 * Add rate limit headers to a Response
 */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  
  if (!result.allowed) {
    headers.set('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
