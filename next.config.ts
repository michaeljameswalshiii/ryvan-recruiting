import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Setting output to standalone helps with deployment detection
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
