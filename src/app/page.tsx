"use client";

import { useEffect, useState } from "react";
import { redirect } from "next/navigation";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated via localStorage
    const token = localStorage.getItem("accessToken");
    if (token) {
      // User is logged in, go to dashboard
      redirect("/dashboard");
    } else {
      // No token, stay on home (login page)
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return null;
  }

  // Stay on home page (login/register) if not authenticated
  return null;
}
