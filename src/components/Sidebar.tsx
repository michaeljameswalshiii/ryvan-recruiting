'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Contact,
  Database,
  MessageSquare,
  Network,
  ListOrdered,
  Activity,
  Moon,
  Sun,
} from 'lucide-react';
import {
  hasPermission,
  type Permission,
} from '@/lib/roles';
import { isApolloUiEnabled } from '@/lib/ai/apollo-feature';
import { useTheme } from '@/components/ThemeProvider';

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
  { name: 'Contacts', href: '/dashboard/contact-info', icon: Contact, permission: 'core_ats' },
  { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, permission: 'core_ats' },
  { name: 'Talent Graph', href: '/dashboard/talent-graph', icon: Network, permission: 'core_ats' },
  { name: 'Sequences', href: '/dashboard/sequences', icon: ListOrdered, permission: 'core_ats' },
  { name: 'AI', href: '/dashboard/general-ai-usage', icon: MessageSquare, permission: 'core_ats' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, permission: 'settings' },
];

const adminItems: MenuItem[] = [
  // AI Apollo: only when NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED=true (code kept for re-enable)
  { name: 'AI Apollo', href: '/dashboard/ai-apollo', icon: Bug, permission: 'ai_apollo' },
  { name: 'AI Reliability', href: '/dashboard/ai-reliability', icon: Activity, permission: 'usage' },
  { name: 'Issues', href: '/dashboard/issues', icon: Bug, permission: 'issues' },
  { name: 'Usage', href: '/dashboard/usage', icon: BarChart3, permission: 'usage' },
];

const siteAdminItems: MenuItem[] = [
  { name: 'Tenants', href: '/dashboard/site-admin', icon: Building2, permission: 'site_admin_tools' },
  { name: 'Dynamo Search Tool', href: '/dashboard/dynamo-search', icon: Database, permission: 'dynamo_search' },
];

interface SidebarProps {
  role?: string | null;
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const { theme, setTheme, isDark } = useTheme();

  const visibleMain = menuItems.filter((item) => hasPermission(role, item.permission));
  const visibleAdmin = adminItems.filter((item) => {
    if (item.href === '/dashboard/ai-apollo' && !isApolloUiEnabled()) return false;
    return hasPermission(role, item.permission);
  });
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

  // Warm common destinations in the background so menu clicks feel instant
  // (especially right after AI work when the main thread was busy).
  useEffect(() => {
    const hrefs = [
      ...visibleMain.map((i) => i.href),
      ...visibleAdmin.map((i) => i.href),
      ...visibleSite.map((i) => i.href),
    ].filter((h) => h !== pathname);

    const prefetchAll = () => {
      for (const href of hrefs.slice(0, 12)) {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };

    // Defer so we never compete with first paint / AI response render
    const t = setTimeout(prefetchAll, 400);
    return () => clearTimeout(t);
    // Only re-run when role-visible set or path changes (not every theme toggle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role, router]);

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
    // IMPORTANT: do not put light pastel classes (bg-blue-50, etc.) on the same
    // element in dark mode — globals map .dark .bg-blue-50 { color: near-black }
    // because the class name still matches even when dark:bg-* overrides fill.
    // Dark nav = pure white text for max contrast on charcoal.
    const base =
      'sidebar-nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all';

    if (isDark) {
      if (isActive) {
        const activeBg =
          activeTone === 'orange'
            ? 'bg-white/15 ring-1 ring-white/20'
            : activeTone === 'purple'
              ? 'bg-white/15 ring-1 ring-white/20'
              : 'bg-white/15 ring-1 ring-white/25';
        return `${base} sidebar-nav-link--active ${activeBg} text-white`;
      }
      return `${base} text-white hover:bg-white/10 hover:text-white`;
    }

    // Light mode
    if (activeTone === 'orange') {
      return `${base} ${
        isActive
          ? 'sidebar-nav-link--active bg-orange-50 text-orange-800'
          : 'text-slate-700 hover:bg-gray-100 hover:text-slate-900'
      }`;
    }
    if (activeTone === 'purple') {
      return `${base} ${
        isActive
          ? 'sidebar-nav-link--active bg-purple-50 text-purple-800'
          : 'text-slate-700 hover:bg-gray-100 hover:text-slate-900'
      }`;
    }
    return `${base} ${
      isActive
        ? 'sidebar-nav-link--active bg-blue-50 text-blue-800'
        : 'text-slate-800 hover:bg-gray-100 hover:text-slate-900'
    }`;
  };

  return (
    <div
      data-app-sidebar
      className="w-72 min-w-[280px] bg-white dark:bg-sidebar border-r border-gray-200 dark:border-border h-screen flex flex-col fixed left-0 top-0 shadow-sm z-50 text-foreground"
    >
      <div className="px-3 pt-3 pb-3 border-b border-gray-200 dark:border-border">
        <Link
          href="/dashboard"
          className="block rounded-lg hover:bg-gray-50/80 dark:hover:bg-white/10 transition-colors -mx-0.5 px-0.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/trio-sourcing-logo.png"
            alt="Trio Sourcing — Powered by Ryvan Recruiting"
            className="w-full h-auto max-h-[5.5rem] object-contain object-left object-top dark:brightness-125 dark:contrast-110"
          />
        </Link>
        {/* Global light / dark toggle — high contrast on dark sidebar */}
        <div
          className="mt-2.5 flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-white/30 dark:bg-black/50 dark:ring-1 dark:ring-white/10"
          role="group"
          aria-label="Color theme"
        >
          <button
            type="button"
            onClick={() => setTheme('white')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
              theme === 'white' || theme === 'gray'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-white dark:text-slate-900'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white'
            }`}
            title="Light UI"
          >
            <Sun className="h-3.5 w-3.5 shrink-0" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('black')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
              isDark
                ? 'bg-white text-slate-900 shadow-md ring-1 ring-white/40'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Dark UI (charcoal background)"
          >
            <Moon className="h-3.5 w-3.5 shrink-0" />
            Dark
          </button>
        </div>
      </div>

      {canScrollUp && (
        <button
          onClick={() => scrollMenu('up')}
          className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-full p-1 shadow-md hover:bg-gray-100 dark:hover:bg-slate-700"
          style={{ left: '50%' }}
        >
          <ChevronUp className="h-4 w-4 text-slate-700 dark:text-slate-100" />
        </button>
      )}

      <nav
        ref={navRef}
        className="flex-1 p-3 overflow-y-auto scrollbar-thin"
        onScroll={checkScroll}
        aria-label="Main"
      >
        <div className="space-y-1">
          {visibleMain.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href, 'blue')}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0 opacity-95" />
                {item.name}
              </Link>
            );
          })}
        </div>

        {visibleAdmin.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-border">
            <div className="sidebar-section-label text-xs font-bold text-slate-500 dark:text-white uppercase tracking-wider px-4 mb-2">
              Admin
            </div>
            <div className="space-y-1">
              {visibleAdmin.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClass(item.href, 'orange')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0 opacity-95" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {visibleSite.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-border">
            <div className="sidebar-section-label text-xs font-bold text-slate-500 dark:text-white uppercase tracking-wider px-4 mb-2">
              Site Admin
            </div>
            <div className="space-y-1">
              {visibleSite.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClass(item.href, 'purple')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0 opacity-95" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {canScrollDown && (
        <button
          onClick={() => scrollMenu('down')}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-full p-1 shadow-md hover:bg-gray-100 dark:hover:bg-slate-700"
          style={{ left: '50%' }}
        >
          <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-100" />
        </button>
      )}

      <div className="p-4 border-t border-gray-200 dark:border-border mt-auto">
        <div className="sidebar-footer-copy text-xs font-medium text-slate-600 dark:text-white text-center">
          © 2026 Trio Recruiting
        </div>
      </div>
    </div>
  );
}
