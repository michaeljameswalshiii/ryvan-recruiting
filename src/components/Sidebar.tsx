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
  UserRound,
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
  // Personal: email, password, AI BYOK
  { name: 'My Settings', href: '/dashboard/settings', icon: UserRound, permission: 'settings' },
  // Org: team, branding, integrations, billing (company admins+)
  {
    name: 'Company Settings',
    href: '/dashboard/settings/company',
    icon: Settings,
    permission: 'team_admin',
  },
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
  tenantScope?: string;
}

export default function Sidebar({ role, tenantScope }: SidebarProps) {
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
  const allTenantsSelected = role === 'site_admin' && tenantScope === 'all';

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

  /** Exact path match, with special-case so My Settings ≠ Company Settings */
  const isNavActive = (href: string) => {
    if (href === '/dashboard/settings') {
      return (
        pathname === '/dashboard/settings' ||
        (pathname.startsWith('/dashboard/settings/') &&
          !pathname.startsWith('/dashboard/settings/company'))
      );
    }
    if (href === '/dashboard/settings/company') {
      return (
        pathname === '/dashboard/settings/company' ||
        pathname.startsWith('/dashboard/settings/company/')
      );
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const linkClass = (href: string, activeTone: 'blue' | 'orange' | 'purple') => {
    const isActive = isNavActive(href);
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
          className="flex items-center justify-center rounded-lg bg-white px-1 py-2 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors min-h-[8.25rem]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/trio-sourcing-logo.png?v=20260804"
            alt="TRIO — Connecting GREAT Companies with GREAT Candidates through GREAT Recruiters"
            className="w-full h-auto max-h-[8.75rem] object-contain object-center mx-auto"
          />
        </Link>
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
            const isActive = isNavActive(item.href);
            const requiresTenant = item.href !== '/dashboard';
            if (allTenantsSelected && requiresTenant) {
              return (
                <div
                  key={item.href}
                  title="Select a tenant from the top bar to open this area"
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 dark:text-slate-500"
                >
                  <item.icon className="h-5 w-5 shrink-0 opacity-70" />
                  {item.name}
                </div>
              );
            }
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

      <div className="p-3 border-t border-gray-200 dark:border-border mt-auto space-y-2">
        {/* Theme toggle — lower-left footer; soft white Light, solid white active */}
        <div
          className="theme-toggle flex rounded-lg p-1 gap-1"
          role="group"
          aria-label="Color theme"
          style={
            isDark
              ? {
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  border: '1px solid rgba(255,255,255,0.28)',
                }
              : {
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                }
          }
        >
          <button
            type="button"
            onClick={() => setTheme('white')}
            title="Light UI"
            className={`theme-toggle-btn flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[12px] font-bold transition ${
              theme === 'white' || theme === 'gray'
                ? 'theme-toggle-btn--active bg-white text-slate-900 shadow-sm'
                : isDark
                  ? 'theme-toggle-btn--light-idle'
                  : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('black')}
            title="Dark UI (charcoal background)"
            className={`theme-toggle-btn flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[12px] font-bold transition ${
              isDark
                ? 'theme-toggle-btn--active'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Dark
          </button>
        </div>
        <div className="sidebar-footer-copy text-xs font-medium text-slate-600 dark:text-white text-center">
          © 2026 Trio Recruiting
        </div>
      </div>
    </div>
  );
}
