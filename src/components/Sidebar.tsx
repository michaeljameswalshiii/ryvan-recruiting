﻿'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  UserRound, 
  Briefcase, 
  AlertTriangle, 
  Kanban, 
  BarChart3, 
  Mail, 
  Settings, 
  Bug,
  ChevronUp, 
  ChevronDown, 
  Info,
  Database,
  MessageSquare,
} from 'lucide-react';

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Candidates', href: '/dashboard/candidates', icon: Users },
  { name: 'Companies', href: '/dashboard/companies', icon: Building2 },
  { name: 'Contact Info', href: '/dashboard/contact-info', icon: Info },
  { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { name: 'General AI Usage', href: '/dashboard/general-ai-usage', icon: MessageSquare },
  { name: 'Reporting', href: '/dashboard/reporting', icon: BarChart3 },
  { name: 'Email', href: '/dashboard/email', icon: Mail },
];

const debugItems = [
  { name: 'Debug Env', href: '/dashboard/debug-env', icon: Bug },
  { name: 'AI Apollo', href: '/dashboard/ai-apollo', icon: Bug },
  { name: 'AI Assistant', href: '/dashboard/ai-assistant', icon: Bug },
  { name: 'Issues', href: '/dashboard/issues', icon: Bug },
  { name: 'Usage', href: '/dashboard/usage', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'Dynamo Search Tool', href: '/dashboard/dynamo-search', icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

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
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 100);
    }
  };

  return (
    <div className="w-72 min-w-[280px] bg-white border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0 shadow-sm z-50">
      {/* Logo / Header */}
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            R
          </div>
          <div>
            <div className="font-semibold text-xl tracking-tight">RyVan Recruiting</div>
            <div className="text-xs text-gray-500">Trio ATS</div>
          </div>
        </div>
      </div>

      {/* Scroll Up Button */}
      {canScrollUp && (
        <button
          onClick={() => scrollMenu('up')}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-100"
          style={{ left: '50%' }}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

{/* Navigation */}
      <nav 
        ref={navRef}
        className="flex-1 p-3 overflow-y-auto scrollbar-thin"
        onScroll={checkScroll}
      >
        <div className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </div>
        
        {/* Debug Section */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
            Debug / Admin
          </div>
          <div className="space-y-1">
            {debugItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-orange-50 text-orange-700' 
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Scroll Down Button */}
      {canScrollDown && (
        <button
          onClick={() => scrollMenu('down')}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-100"
          style={{ left: '50%' }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {/* Footer */}
      <div className="p-4 border-t mt-auto">
        <div className="text-xs text-gray-500 text-center">
          © 2026 RyVan Recruiting
        </div>
      </div>
    </div>
  );
}
