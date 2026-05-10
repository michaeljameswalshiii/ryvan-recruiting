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
        // Not authenticated, stay on home (login page)
        setIsLoading(false);
      }
    }).catch(() => {
      // Error checking auth, stay on home
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return null;
  }

  // Stay on home page (login/register) if not authenticated
  return null;
}
