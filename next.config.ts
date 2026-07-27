import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No output setting - use default (standalone-like behavior without explicit config)
  // This fixes the static export build errors
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Keep pdfjs (and canvas optional peer) resolvable at runtime on Vercel
  // so resume parsing does not hit MODULE_NOT_FOUND for dynamic imports.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "mammoth"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
