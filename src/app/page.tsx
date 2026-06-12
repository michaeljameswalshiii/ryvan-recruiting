"use client";

import { useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { checkAuth } from "@/lib/api/auth-client";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated via secure session cookie
    checkAuth().then((isAuthenticated) => {
      if (isAuthenticated) {
        // User is logged in, go to dashboard
        redirect("/dashboard");
      } else {
        // Not authenticated, redirect to login page
        redirect("/login");
      }
    }).catch(() => {
      // Error checking auth, redirect to login
      redirect("/login");
    });
  }, []);

  // Show loading while checking auth
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
