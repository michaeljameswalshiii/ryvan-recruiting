'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  BarChart3,
  Settings,
  Bug,
  ChevronUp,
  ChevronDown,
  Info,
  Database,
  MessageSquare,
} from 'lucide-react';
import {
  hasPermission,
  roleLabel,
  type Permission,
} from '@/lib/roles';

type MenuItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
};

const menuItems: MenuItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'core_ats' },
  { name: 'Candidates', href: '/dashboard/candidates', icon: Users, permission: 'core_ats' },
  { name: 'Companies', href: '/dashboard/companies', icon: Building2, permission: 'core_ats' },
  { name: 'Contact Info', href: '/dashboard/contact-info', icon: Info, permission: 'core_ats' },
  { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, permission: 'core_ats' },
  { name: 'AI Assistant', href: '/dashboard/general-ai-usage', icon: MessageSquare, permission: 'core_ats' },
  { name: 'Reporting', href: '/dashboard/reporting', icon: BarChart3, permission: 'core_ats' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, permission: 'settings' },
];

const adminItems: MenuItem[] = [
  { name: 'AI Apollo', href: '/dashboard/ai-apollo', icon: Bug, permission: 'ai_apollo' },
  { name: 'Issues', href: '/dashboard/issues', icon: Bug, permission: 'issues' },
  { name: 'Usage', href: '/dashboard/usage', icon: BarChart3, permission: 'usage' },
];

const siteAdminItems: MenuItem[] = [
  { name: 'Dynamo Search Tool', href: '/dashboard/dynamo-search', icon: Database, permission: 'dynamo_search' },
];

interface SidebarProps {
  role?: string | null;
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const visibleMain = menuItems.filter((item) => hasPermission(role, item.permission));
  const visibleAdmin = adminItems.filter((item) => hasPermission(role, item.permission));
  const visibleSite = siteAdminItems.filter((item) => hasPermission(role, item.permission));

  const checkScroll = () => {
    if (navRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = navRef.current;
      setCanScrollUp(scrollTop > 0);
      setCanScrollDown(scrollTop + clientHeight < scrollHeight);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const scrollMenu = (direction: 'up' | 'down') => {
    if (navRef.current) {
      const scrollAmount = 150;
      navRef.current.scrollBy({
        top: direction === 'down' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 100);
    }
  };

  const linkClass = (href: string, activeTone: 'blue' | 'orange' | 'purple') => {
    const isActive = pathname === href || pathname.startsWith(href + '/');
    if (activeTone === 'orange') {
      return `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        isActive ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-100'
      }`;
    }
    if (activeTone === 'purple') {
      return `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        isActive ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:bg-gray-100'
      }`;
    }
    return `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
    }`;
  };

  return (
    <div className="w-72 min-w-[280px] bg-white border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0 shadow-sm z-50">
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            R
          </div>
          <div>
            <div className="font-semibold text-xl tracking-tight">RyVan Recruiting</div>
            <div className="text-xs text-gray-500">
              {role ? roleLabel(role) : 'Trio ATS'}
            </div>
          </div>
        </div>
      </div>

      {canScrollUp && (
        <button
          onClick={() => scrollMenu('up')}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-100"
          style={{ left: '50%' }}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      <nav
        ref={navRef}
        className="flex-1 p-3 overflow-y-auto scrollbar-thin"
        onScroll={checkScroll}
      >
        <div className="space-y-1">
          {visibleMain.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href, 'blue')}>
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </div>

        {visibleAdmin.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
              Admin
            </div>
            <div className="space-y-1">
              {visibleAdmin.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href, 'orange')}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {visibleSite.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
              Site Admin
            </div>
            <div className="space-y-1">
              {visibleSite.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href, 'purple')}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {canScrollDown && (
        <button
          onClick={() => scrollMenu('down')}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-100"
          style={{ left: '50%' }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      <div className="p-4 border-t mt-auto">
        <div className="text-xs text-gray-500 text-center">© 2026 RyVan Recruiting</div>
      </div>
    </div>
  );
}
