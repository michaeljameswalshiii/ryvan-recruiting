/**
 * @deprecated DEPRECATED AUTH MODULE
 * 
 * ⚠️ WARNING: This module is deprecated and insecure!
 * 
 * This file uses localStorage to store tokens, which is vulnerable to XSS attacks.
 * 
 * FOR NEW CODE: Use the following instead:
 * - Server-side auth: src/lib/server-auth.ts (httpOnly cookies)
 * - Client auth API: src/lib/api/auth-client.ts (calls server-side API)
 * - Login form: src/components/forms/login-form.tsx
 * - Signup form: src/components/forms/signup-form.tsx
 * 
 * This file will be removed in a future version.
 * 
 * @deprecated
 */
"use client";

// Import will fail in production - aws.ts throws in production
import { signIn as awsSignIn, signUp as awsSignUp, signOut as awsSignOut, getCurrentUser, createTenant, createProfile } from "./aws";

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function signIn(email: string, password: string) {
  try {
    await awsSignIn(email, password);
    
    // Get the user to find their sub (user ID)
    const user = await getCurrentUser();
    const userSub = user?.find(a => a.Name === "sub")?.Value;
    
    // Try to get the user's profile to find their tenant
    let tenantId = null;
    if (userSub) {
      try {
        const profile = await import("./aws").then(m => m.getProfile(userSub));
        if (profile) {
          tenantId = profile.tenant_id;
        }
      } catch (profileError) {
        console.log("Could not fetch profile:", profileError);
      }
    }
    
    // Store in localStorage for client-side auth check
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", "true");
      // Also store tenant ID if found
      if (tenantId) {
        localStorage.setItem("tenantId", tenantId);
      }
    }
    // Return success - let the caller handle redirect
    return { success: true };
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
}

export async function signUp(
  email: string,
  password: string,
  tenantName: string,
  subdomain: string,
  fullName: string
) {
  try {
    // Sign up with Cognito
    const result = await awsSignUp(email, password, fullName);
    
    // Get the user sub from the result (Cognito user ID)
    const userId = result.UserSub || generateId();
    const tenantId = generateId();
    
    // Create tenant record
    await createTenant({
      id: tenantId,
      name: tenantName,
      subdomain: subdomain.toLowerCase().replace(/\s+/g, "-"),
    });
    
    // Create profile linked to tenant
    await createProfile({
      id: userId,
      tenant_id: tenantId,
      email,
      full_name: fullName,
      role: "customer_admin",
    });
    
    // Store tenant_id for session
    if (typeof window !== "undefined") {
      localStorage.setItem("tenantId", tenantId);
    }
    
    console.log("Sign up result:", result);
    // Return success - let the caller handle redirect
    return { success: true };
  } catch (error) {
    console.error("Sign up error:", error);
    throw error;
  }
}

export async function signOut() {
  await awsSignOut();
  // Clear localStorage for fresh sign in
  if (typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("tenantId");
    localStorage.removeItem("leads");
    localStorage.removeItem("companies");
  }
  // Let caller handle redirect
}

export async function getSession() {
  try {
    const user = await getCurrentUser();
    return user;
  } catch {
    return null;
  }
}

export async function getCurrentUserProfile() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    
    // Extract user attributes
    const email = user.find((a) => a.Name === "email")?.Value || "";
    const name = user.find((a) => a.Name === "name")?.Value || "";
    const sub = user.find((a) => a.Name === "sub")?.Value || "";
    
    return {
      id: sub,
      email,
      full_name: name,
    };
  } catch {
    return null;
  }
}
