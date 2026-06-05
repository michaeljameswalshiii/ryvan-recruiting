"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Building2, User, Briefcase, BarChart3, Bot, Settings, LogOut } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const themeOptions = [
  { value: "white", label: "Light", icon: "⬜" },
  { value: "gray", label: "Gray", icon: "⬛" },
  { value: "black", label: "Dark", icon: "🌙" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/candidates", label: "Candidates", icon: Users },
    { href: "/dashboard/companies", label: "Companies", icon: Building2 },
    { href: "/dashboard/contacts", label: "Contacts", icon: User },
    { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
    { href: "/dashboard/reporting", label: "Reporting", icon: BarChart3 },
    { href: "/dashboard/ai", label: "AI Apollo", icon: Bot },
  ];

  return (
    <div className="w-64 border-r border-border bg-card flex flex-col h-screen flex-shrink-0">
      {/* Header with Logo + Theme Toggle */}
      <div className="p-5 border-b border-border">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">RyVan Recruiting</h1>
        </div>

        {/* Prominent Theme Toggle */}
        <div className="flex bg-muted p-1 rounded-2xl">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                theme === option.value
                  ? "bg-background shadow-sm text-foreground"
                  : "hover:bg-background/70 text-muted-foreground"
              }`}
            >
              <span className="text-lg">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border mt-auto">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground mb-1"
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
        <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground w-full">
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
