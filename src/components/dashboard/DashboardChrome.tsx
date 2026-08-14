"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { DashboardHeader } from "@/components/dashboard/header";

type HeaderUser = React.ComponentProps<typeof DashboardHeader>["user"];

/**
 * Responsive app chrome: full sidebar on xl+, slide-out drawer on tablet/phone.
 */
export function DashboardChrome({
  role,
  tenantScope,
  user,
  children,
}: {
  role?: string | null;
  tenantScope?: string;
  user?: HeaderUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <>
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 xl:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <Sidebar
        role={role}
        tenantScope={tenantScope}
        mobileOpen={navOpen}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="min-w-0 max-w-full bg-background xl:ml-72">
        <DashboardHeader user={user} onOpenNav={() => setNavOpen(true)} />
        <main className="min-w-0 max-w-full overflow-x-hidden p-3 sm:p-4 xl:p-6">
          {children}
        </main>
      </div>
    </>
  );
}
