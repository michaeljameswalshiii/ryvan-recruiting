/**
 * Auth Client API
 * 
 * Client-safe auth functions that call server-side API.
 * This replaces the old lib/auth.ts for client use.
 * 
 * @clientSafe
 */

const API_BASE = '/api/auth';

/**
 * Login using server-side auth
 */
export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include cookies
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }

  return data;
}

/**
 * Register new user using server-side auth
 */
export async function register(
  email: string,
  password: string,
  fullName: string,
  tenantName: string,
  subdomain: string
) {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email,
      password,
      confirmPassword: password, // Same as password for validation
      fullName,
      tenantName,
      subdomain,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Registration failed');
  }

  return data;
}

/**
 * Logout - clears session cookie
 */
export async function logout() {
  const response = await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Logout failed');
  }

  return true;
}

/**
 * Check if user is authenticated
 */
export async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get current user info from session
 */
export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
} | null> {
  try {
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch {
    return null;
  }
}
