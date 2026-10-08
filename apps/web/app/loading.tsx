import Logo from "@/components/Logo";

/** Next.js's automatic per-navigation Suspense fallback — shown immediately (sidebar stays
    mounted, untouched) the moment a Link/command-palette navigation is requested, for however
    long the new route's server round-trip takes, then swapped for the real page once it
    resolves. Living at the app root means every route inherits it. The "sheddex" logo, gently
    pulsing, so a page that's visibly loading reads as "working," not as a frozen logo. */
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Logo height={44} className="animate-pulse" />
    </div>
  );
}
