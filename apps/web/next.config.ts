import path from "node:path";
import type { NextConfig } from "next";

// This app now lives at apps/web inside a pnpm monorepo (repo root is two levels up) — both of
// these tell Next's file tracing / Turbopack to treat the monorepo root as the workspace root
// instead of inferring it (which gets confused by the extra `apps/*`/`packages/*` nesting and can
// silently drop a traced file from the serverless output). See PROJECT.md's Expo-migration plan.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  // `@jam-practice/convex` (packages/convex) is a workspace package of plain, untranspiled
  // TypeScript (Convex's own generated `_generated/api.ts` etc.) — Next only transpiles files
  // inside this app by default, so an external workspace package needs to be opted in explicitly
  // or its imports fail to build.
  transpilePackages: ["@jam-practice/convex", "@jam-practice/core"],
};

export default nextConfig;
