import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@edge-lab/ui", "@edge-lab/editor", "@edge-lab/sync", "@edge-lab/hardware"],
  eslint: {
    // We run ESLint in CI separately; don't block production builds on lint warnings
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
