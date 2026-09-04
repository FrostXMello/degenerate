import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
