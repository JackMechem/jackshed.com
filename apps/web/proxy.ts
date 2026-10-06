import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// No route-gating here — every tool stays fully usable signed out (see PROJECT.md). This proxy
// (Next.js 16 renamed "middleware.ts" to "proxy.ts"; the underlying API is unchanged) exists to
// proxy sign-in/sign-out requests to Convex and refresh the auth cookies on navigation, which the
// OAuth (Google) flow specifically depends on.
export default convexAuthNextjsMiddleware();

export const config = {
  // Skip static assets and Next's internals; run on everything else (matches the standard
  // Convex Auth Next.js template's matcher).
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
