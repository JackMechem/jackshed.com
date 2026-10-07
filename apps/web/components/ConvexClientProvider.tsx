"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** The client half of the auth setup — pairs with `ConvexAuthNextjsServerProvider` (server,
    reads cookies during SSR) in `app/layout.tsx`. Holds the actual live `ConvexReactClient`
    connection; everything under it can call `useQuery`/`useMutation`/`useAuthActions`. */
export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
