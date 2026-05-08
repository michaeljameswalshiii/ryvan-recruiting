"use client";

import { signIn as awsSignIn, signUp as awsSignUp, signOut as awsSignOut, getCurrentUser, createTenant, createProfile } from "./aws";
import { redirect } from "next/navigation";

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
    // Store in localStorage for client-side auth check
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", "true");
    }
    redirect("/dashboard");
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
      role: "admin",
    });
    
    // Store tenant_id for session
    if (typeof window !== "undefined") {
      localStorage.setItem("tenantId", tenantId);
    }
    
    console.log("Sign up result:", result);
    redirect("/dashboard");
  } catch (error) {
    console.error("Sign up error:", error);
    throw error;
  }
}

export async function signOut() {
  await awsSignOut();
  redirect("/");
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
