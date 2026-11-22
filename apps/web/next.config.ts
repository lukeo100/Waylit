import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Shared workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: [
    "@waylit/core",
    "@waylit/vehicle",
    "@waylit/map-provider",
    "@waylit/ui-tokens",
  ],
};

export default nextConfig;
