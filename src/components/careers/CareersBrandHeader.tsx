"use client";

import Link from "next/link";
import { useState } from "react";

export type CareersBrandProps = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  tagline?: string | null;
  /** Company website — logo becomes a link when set (e.g. Ryvan → ryvanrecruiting.com) */
  websiteUrl?: string | null;
  /** When set, show back link instead of full hero title treatment */
  backHref?: string;
  backLabel?: string;
  /** Optional page title under brand (e.g. job title) */
  pageTitle?: string;
  pageMeta?: React.ReactNode;
};

/**
 * Shared multi-tenant careers branding header.
 * Logo sources (in order): tenant logo_url → /branding/{slug}-logo.* static file.
 */
export function CareersBrandHeader({
  name,
  slug,
  logoUrl,
  primaryColor,
  tagline,
  websiteUrl,
  backHref,
  backLabel = "← All open roles",
  pageTitle,
  pageMeta,
}: CareersBrandProps) {
  const accent = primaryColor || "#1d4ed8";
  // Prefer tenant logo_url; else try common static extensions for /branding/{slug}-logo.*
  const fallbacks = [
    logoUrl,
    `/branding/${slug}-logo.jpg`,
    `/branding/${slug}-logo.png`,
    `/branding/${slug}-logo.webp`,
    `/branding/${slug}-logo.svg`,
  ].filter(Boolean) as string[];
  const [logoIdx, setLogoIdx] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const resolvedLogo = fallbacks[Math.min(logoIdx, fallbacks.length - 1)];

  return (
    <header
      className="border-b border-slate-200 bg-white"
      style={{ borderBottomColor: `${accent}33` }}
    >
      {/* Brand bar */}
      <div
        className="border-b border-slate-100"
        style={{
          background: `linear-gradient(135deg, ${accent}0d 0%, transparent 55%)`,
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-6">
          {/* Logo ~50% larger; CAREERS + company name start to the right of the logo */}
          <div className="flex flex-row items-center gap-5 sm:gap-6 min-w-0">
            {(() => {
              const logoEl =
                !logoFailed && resolvedLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolvedLogo}
                    alt={`${name} logo`}
                    className="h-24 sm:h-[7.5rem] w-24 sm:w-[7.5rem] shrink-0 rounded-full object-contain bg-white shadow-sm ring-1 ring-slate-100 transition group-hover:ring-slate-200"
                    onError={() => {
                      if (logoIdx < fallbacks.length - 1) {
                        setLogoIdx((i) => i + 1);
                      } else {
                        setLogoFailed(true);
                      }
                    }}
                  />
                ) : (
                  <div
                    className="flex h-24 w-24 sm:h-[7.5rem] sm:w-[7.5rem] rounded-full items-center justify-center text-white text-3xl font-bold shrink-0 shadow-sm"
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  >
                    {(name || "C").charAt(0).toUpperCase()}
                  </div>
                );

              if (websiteUrl) {
                return (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ ["--tw-ring-color" as string]: accent }}
                    title={`Visit ${name}`}
                    aria-label={`${name} website`}
                  >
                    {logoEl}
                  </a>
                );
              }
              return logoEl;
            })()}
            <div className="min-w-0 flex-1 text-left">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: accent }}
              >
                Careers
              </p>
              {websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 hover:underline underline-offset-2 block"
                >
                  {name}
                </a>
              ) : (
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  {name}
                </p>
              )}
              {!pageTitle && (
                <p className="mt-2 text-sm text-slate-500 max-w-xl">
                  {tagline ||
                    "Search open roles and apply through our recruiting team."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Page chrome (job detail etc.) */}
      {(backHref || pageTitle) && (
        <div className="mx-auto max-w-3xl px-6 py-5">
          {backHref && (
            <Link
              href={backHref}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              {backLabel}
            </Link>
          )}
          {pageTitle && (
            <>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                {pageTitle}
              </h1>
              {pageMeta && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  {pageMeta}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </header>
  );
}
