import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
