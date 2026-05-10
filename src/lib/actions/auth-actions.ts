/**
 * Auth Server Actions
 * Server-side authentication actions using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  authenticateUser,
  registerUser,
  signOutFromCognito,
  getSession,
} from '../server-auth';
import { loginSchema, registerSchema } from '../schemas/auth';
import { z } from 'zod';

/**
 * Login action - validates credentials and sets session cookie
 */
export async function loginAction(formData: FormData) {
  const rawData = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  // Validate input
  const validated = loginSchema.safeParse(rawData);
  
  if (!validated.success) {
    const errors = validated.error.flatten().fieldErrors;
    return {
      error: errors.email?.[0] || errors.password?.[0] || 'Invalid credentials',
    };
  }

  try {
    // Authenticate and set cookie
    await authenticateUser(validated.data.email, validated.data.password);
    
    // Return success - caller should redirect
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Login failed' };
  }
}

/**
 * Register action - creates new user and tenant, then logs in
 */
export async function registerAction(formData: FormData) {
  const rawData = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
    fullName: formData.get('fullName') as string,
    tenantName: formData.get('tenantName') as string,
    subdomain: formData.get('subdomain') as string,
  };

  // Validate input
  const validated = registerSchema.safeParse(rawData);
  
  if (!validated.success) {
    const errors = validated.error.flatten().fieldErrors;
    return {
      error: errors.email?.[0] || 
             errors.password?.[0] || 
             errors.confirmPassword?.[0] || 
             errors.fullName?.[0] ||
             errors.tenantName?.[0] ||
             errors.subdomain?.[0] ||
             'Registration failed',
    };
  }

try {
    // Register and auto-login
    await registerUser(
      validated.data.email,
      validated.data.password,
      validated.data.fullName,
      validated.data.tenantName,
      validated.data.subdomain
    );
    
    // Return success - caller should redirect
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Registration failed' };
  }
}

/**
 * Logout action - clears session cookie
 */
export async function logoutAction() {
  try {
    const session = await getSession();
    if (session?.accessToken) {
      await signOutFromCognito(session.accessToken);
    }
  } catch {
    // Ignore errors on logout
  }
  
  // Redirect to home
  redirect('/');
}

/**
 * Get current session for server components
 */
export async function getCurrentSession() {
  return getSession();
}

/**
 * Require session - throws redirect if not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }
  
  return session;
}
