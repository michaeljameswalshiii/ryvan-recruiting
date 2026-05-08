"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/nav";
import { DashboardHeader } from "@/components/dashboard/header";
import { getAccessToken } from "@/lib/aws";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    // Skip auth check in dev mode
    if (process.env.NODE_ENV !== "development") {
      const token = getAccessToken();
      if (!token) {
        router.push("/login");
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <div className="pl-64">
        <DashboardHeader />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
