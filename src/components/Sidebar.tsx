"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      <div className="p-6 font-bold text-2xl border-b">RyVan Recruiting</div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all ${
                isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t mt-auto">
        <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 text-gray-700">
          ⚙️ Settings
        </Link>
        <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 text-gray-700">
          ← Sign out
        </a>
      </div>
    </div>
  );
}
