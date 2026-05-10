/**
 * Simple Caching Layer
 * 
 * Provides in-memory caching for development and small-scale production.
 * For larger production, replace with Vercel KV or Redis.
 * 
 * @serverOnly
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

// In-memory cache (resets on each serverless function invocation)
const memoryCache = new Map<string, CacheEntry<any>>();

// Default TTL: 5 minutes
const DEFAULT_TTL = 300;

/**
 * Get a value from cache
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const entry = memoryCache.get(key);
  
  if (!entry) {
    return null;
  }
  
  // Check if expired
  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * Set a value in cache
 */
export async function setCached<T>(
  key: string, 
  data: T, 
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  memoryCache.set(key, {
    data,
    expires: Date.now() + (ttlSeconds * 1000),
  });
}

/**
 * Invalidate cache entries matching a pattern
 * Note: Simple implementation - only supports exact match or prefix
 */
export async function invalidateCache(pattern?: string): Promise<void> {
  if (!pattern) {
    // Clear all
    memoryCache.clear();
    return;
  }
  
  // Delete entries starting with pattern
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pattern)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Get or set pattern - fetch from source if not cached
 */
export async function getOrSetCached<T>(
  key: string,
  sourceFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL
): Promise<T> {
  // Try to get from cache first
  const cached = await getCached<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch from source
  const data = await sourceFn();
  
  // Store in cache
  await setCached(key, data, ttlSeconds);
  
  return data;
}

/**
 * Generate a cache key with tenant isolation
 */
export function makeCacheKey(tenantId: string, ...parts: string[]): string {
  return `tenant:${tenantId}:${parts.join(':')}`;
}

/**
 * Invalidate all cache for a specific tenant
 */
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  await invalidateCache(`tenant:${tenantId}:`);
}

// ============================================================================
// Vercel KV Integration (optional)
// ============================================================================

// If Vercel KV is configured, use it instead of in-memory cache
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

const useKv = !!(kvUrl && kvToken);

/**
 * Get from Vercel KV
 */
async function getFromKv<T>(key: string): Promise<T | null> {
  if (!useKv) return null;
  
  try {
    const response = await fetch(`${kvUrl}/get/${key}`, {
      headers: {
        Authorization: `Bearer ${kvToken}`,
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.value as T;
  } catch {
    return null;
  }
}

/**
 * Set in Vercel KV
 */
async function setInKv<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  if (!useKv) return;
  
  try {
    await fetch(`${kvUrl}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        value: data,
        ex: ttlSeconds,
      }),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Delete from Vercel KV
 */
async function deleteFromKv(key: string): Promise<void> {
  if (!useKv) return;
  
  try {
    await fetch(`${kvUrl}/del/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
      },
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Unified cache operations - checks both memory and KV
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    // Try memory first
    const memoryResult = await getCached<T>(key);
    if (memoryResult !== null) {
      return memoryResult;
    }
    
    // Try KV
    if (useKv) {
      const kvResult = await getFromKv<T>(key);
      if (kvResult !== null) {
        // Populate memory cache too
        await setCached(key, kvResult, DEFAULT_TTL);
        return kvResult;
      }
    }
    
    return null;
  },
  
  async set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
    // Set in both memory and KV
    await setCached(key, data, ttlSeconds);
    if (useKv) {
      await setInKv(key, data, ttlSeconds);
    }
  },
  
  async invalidate(pattern?: string): Promise<void> {
    await invalidateCache(pattern);
  },
  
  async getOrSet<T>(
    key: string,
    sourceFn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch from source
    const data = await sourceFn();
    
    // Store in cache
    await this.set(key, data, ttlSeconds);
    
    return data;
  },
};
