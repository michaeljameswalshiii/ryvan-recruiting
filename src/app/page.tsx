"use client";

import { useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { checkAuth } from "@/lib/api/auth-client";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth().then((isAuthenticated) => {
      redirect(isAuthenticated ? "/dashboard" : "/login");
    }).catch(() => redirect("/login"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center"><p className="text-muted-foreground">Loading...</p></div>
    </div>
  );
}
