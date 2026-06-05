"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  Building2,
  User,
  Briefcase,
  BarChart3,
  Settings,
  LogOut,
  Search,
  Sparkles,
  Activity,
  Database,
} from "lucide-react";
import { logout } from "@/lib/api/auth-client";
import { useTheme } from "@/components/ThemeProvider";

const themeOptions = [
  { value: "white", label: "White", icon: "⬜" },
  { value: "gray", label: "Gray", icon: "⬛" },
  { value: "black", label: "Black", icon: "🌙" },
] as const;

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/dashboard/candidates", label: "Candidates", icon: Users },
  { href: "/dashboard/companies", label: "Companies", icon: Building2 },
  { href: "/dashboard/contacts", label: "Contacts", icon: User },
  { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  { href: "/dashboard/ai-apollo", label: "AI Apollo", icon: Sparkles },
  { href: "/dashboard/usage", label: "AI Usage", icon: Activity },
  { href: "/dashboard/reporting", label: "Reporting", icon: BarChart3 },
  { href: "/admin/dynamodb", label: "DynamoDB Viewer", icon: Database },
];

interface DashboardNavProps {
  session?: {
    userId: string;
    email: string;
    fullName: string;
    tenantId: string;
    role: string;
  };
}

export function DashboardNav({ session }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <nav className="w-64 h-screen bg-sidebar border-r border-border fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold">RyVan Recruiting</h1>
        {/* Theme Toggle */}
        <div className="flex gap-1">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:scale-110 ${
                theme === option.value ? "bg-blue-600 text-white shadow" : "hover:bg-accent"
              }`}
              title={option.label}
            >
              {option.icon}
            </button>
          ))}
        </div>
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
