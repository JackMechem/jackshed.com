import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { FONT_VARIABLE_CLASSES } from "@/app/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import AppShell from "@/components/AppShell";
import BackgroundToolDock from "@/components/BackgroundToolDock";
import CommandPalette from "@/components/CommandPalette";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import PracticeTimerAlert from "@/components/PracticeTimerAlert";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import Sidebar from "@/components/Sidebar";
import UsernamePrompt from "@/components/UsernamePrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "sheddex",
  description: "Practice tools for musicians: a jam tune picker, a note trainer, and more.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f4f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${FONT_VARIABLE_CLASSES} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh overflow-hidden bg-surface" suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {/* Server (reads the auth cookie during SSR) wraps client (holds the live Convex
            connection) — the app's first-ever context providers. Purely additive: no visual/DOM
            change, everything below is unchanged.

            Tried dropping ConvexAuthNextjsServerProvider to keep every route statically
            prerendered (it forces dynamic rendering app-wide by reading cookies() in the root
            layout — confirmed via `pnpm build`'s route summary going from every route ○ Static to
            every route ƒ Dynamic). That's not just a missed optimization: without it, `pnpm build`
            fails outright — "Cannot destructure property 'isLoading' of 'c(...)' as it is
            undefined" while prerendering /chord-charts — Convex Auth's client-side context isn't
            safely renderable during Next's build-time static pass on its own. So this is the
            required setup, not a preference; every route being server-rendered-on-demand is the
            real, unavoidable cost of adding Convex Auth here. */}
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <Sidebar />
            <CommandPalette />
            <PracticeTimerWidget mobile />
            <PracticeTimerAlert />
            <UsernamePrompt />
            <BackgroundToolDock />
            <AppShell>{children}</AppShell>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
