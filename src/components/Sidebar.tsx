"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/candidates", label: "Candidates", icon: "👥" },
  { href: "/companies", label: "Companies", icon: "🏢" },
  { href: "/contacts", label: "Contacts", icon: "📇" },
  { href: "/jobs", label: "Jobs", icon: "💼" },
  { href: "/ai-apollo", label: "AI Apollo", icon: "✨" },
  { href: "/ai-usage", label: "AI Usage", icon: "📈" },
  { href: "/reporting", label: "Reporting", icon: "📋" },
  { href: "/dynamodb-viewer", label: "DynamoDB Viewer", icon: "🗄️" },
];

const themeOptions = [
  { value: "white", label: "White", icon: "⬜" },
  { value: "gray", label: "Gray", icon: "⬛" },
  { value: "black", label: "Black", icon: "🌙" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-full flex-shrink-0">
      <div className="p-4 font-bold text-2xl border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <span>RyVan Recruiting</span>
        
        {/* Theme Toggle */}
        <div className="flex gap-1">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
                theme === option.value
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400"
              }`}
              title={`${option.label} theme`}
            >
              {option.icon}
            </button>
          ))}
        </div>
      </div>

<nav className="flex-1 p-3 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all ${
                isActive 
                  ? "bg-blue-600 text-white" 
                  : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-slate-700 mt-auto">
        <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300">
          ⚙️ Settings
        </Link>
        <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300">
          ← Sign out
        </a>
      </div>
    </div>
  );
}
