import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/shared ships TypeScript source, so Next has to compile it.
  transpilePackages: ["@repo/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
