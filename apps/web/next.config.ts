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
  // Browsers must always re-check the worker scripts, or an update could be delayed by days.
  // These headers apply when Next.js serves the app. A static host needs the same rule, see docs/PWA.md.
  async headers() {
    const noCache = [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }];
    return [
      { source: "/sw.js", headers: noCache },
      { source: "/sw-strategy.js", headers: noCache },
    ];
  },
};

export default nextConfig;
