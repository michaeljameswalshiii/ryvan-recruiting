import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  disableHardwareAcceleration: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
