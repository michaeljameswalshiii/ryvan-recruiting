import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows CI/verification builds to avoid colliding with a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // No output setting - use default (standalone-like behavior without explicit config)
  // This fixes the static export build errors
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Keep pdfjs (and canvas optional peer) resolvable at runtime on Vercel
  // so resume parsing does not hit MODULE_NOT_FOUND for dynamic imports.
  serverExternalPackages: [
    "pdfjs-dist",
    "unpdf",
    "@napi-rs/canvas",
    "mammoth",
    "all-the-cities",
    "zipcodes",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
