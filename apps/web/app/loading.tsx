import Wordmark from "@/components/Wordmark";

/** Next.js's automatic per-navigation Suspense fallback — shown immediately (sidebar stays
    mounted, untouched) the moment a Link/command-palette navigation is requested, for however
    long the new route's server round-trip takes, then swapped for the real page once it
    resolves. Living at the app root means every route inherits it (none define their own), which
    is what makes it apply app-wide rather than needing one per tool folder. The same "sheddex"
    wordmark-with-waveform the sidebar/mobile menu headers and the home hero already use
    (`components/Wordmark.tsx`), just with its `animate` prop on — the waveform bars pulse instead
    of sitting still, so a page that's visibly loading reads as "working," not as a frozen logo. */
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Wordmark
        size="lg"
        animate
        className="h-16 w-64 justify-center"
        textClassName="text-3xl sm:text-4xl"
      />
    </div>
  );
}
