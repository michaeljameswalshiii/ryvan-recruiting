"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  Building2,
  Briefcase,
  Kanban,
  BarChart3,
  Settings,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import { signOut } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/dashboard/sourcing", label: "Sourcing", icon: Search },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/dashboard/companies", label: "Companies", icon: Building2 },
{ href: "/dashboard/ai-assistant", label: "AI Assistant (Web)", icon: Sparkles },
  { href: "/dashboard/ai-apollo", label: "AI Apollo", icon: Sparkles },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <nav className="w-64 h-screen bg-sidebar border-r border-border fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold">TurnkeyOpt</h1>
      </div>

      <div className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-border space-y-1">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
