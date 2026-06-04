import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "RyVan Recruiting",
  description: "Turnkey Optimization Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            {/* ←←← This is the key: Sidebar is here, so it's on EVERY page */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Bar */}
              <header className="h-16 border-b bg-white px-6 flex items-center justify-between flex-shrink-0">
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search candidates, companies, jobs..."
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg pl-10 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div>🔔</div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">U</div>
                    <span>User</span>
                  </div>
                </div>
              </header>

              {/* Page Content */}
              <main className="flex-1 overflow-auto p-6">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
