"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import BeatIndicator from "@/components/BeatIndicator";
import { OPEN_PALETTE_EVENT } from "@/components/CommandPalette";
import {
  ChordChartIcon,
  EarIcon,
  MetricModulationIcon,
  MetronomeIcon,
  SearchIcon,
  ShuffleIcon,
} from "@/components/tools";
import Wordmark from "@/components/Wordmark";

/** A small "preview" tile for one tool — genuinely reusing a piece of that tool's own real UI
    where that's cheap and static-friendly (`BeatIndicator` for Metronome), and a plain,
    hand-styled stand-in built from this app's own tokens everywhere else, rather than a stock
    photo or a screenshot. The whole tile is a real `Link`, so clicking anywhere on it is how it's
    "interactive" — there's no live audio or state running on the landing page itself, just a
    preview that leads straight to the real, fully working tool. */
function PreviewCard({
  href,
  hero,
  className = "",
  children,
}: {
  href: string;
  /** The larger, centered tile standing in for the reference design's phone mockup. */
  hero?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-2xl p-4 shadow-lg shadow-black/5 ring-1 outline-none transition-transform hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-accent ${
        hero
          ? "bg-accent/5 ring-accent/20"
          : "bg-surface ring-foreground/5"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

function PreviewLabel({
  icon: Icon,
  children,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-accent" />
      {children}
    </div>
  );
}

const PREVIEWS: { href: string; hero?: boolean; content: React.ReactNode }[] = [
  {
    href: "/metronome",
    hero: true,
    content: (
      <>
        <div className="flex items-center justify-between">
          <PreviewLabel icon={MetronomeIcon}>Metronome</PreviewLabel>
          <span className="text-xs tabular-nums text-muted">100 BPM</span>
        </div>
        <div className="mt-4 flex justify-center">
          <BeatIndicator accents={[2, 1, 1, 1]} currentBeat={0} size="sm" />
        </div>
      </>
    ),
  },
  {
    href: "/jam-practice",
    content: (
      <>
        <PreviewLabel icon={ShuffleIcon}>Jam Practice</PreviewLabel>
        <p className="mt-2 truncate text-sm font-semibold">Autumn Leaves</p>
        <p className="text-xs text-muted">♩ 140 · Cm</p>
      </>
    ),
  },
  {
    href: "/chord-charts",
    content: (
      <>
        <PreviewLabel icon={ChordChartIcon}>Chord Charts</PreviewLabel>
        <div className="mt-2 grid grid-cols-2 gap-1 text-center text-xs font-semibold tabular-nums">
          {["CΔ7", "A-7", "D-7", "G7"].map((chord) => (
            <span key={chord} className="rounded-md bg-background px-2 py-1">
              {chord}
            </span>
          ))}
        </div>
      </>
    ),
  },
  {
    href: "/guess-the-interval",
    content: (
      <>
        <PreviewLabel icon={EarIcon}>Guess the Interval</PreviewLabel>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[0.65rem] font-medium">
          <span className="rounded-md bg-accent px-2 py-1 text-center text-accent-foreground">
            Major 3rd
          </span>
          <span className="rounded-md bg-background px-2 py-1 text-center text-muted">
            Minor 3rd
          </span>
          <span className="rounded-md bg-background px-2 py-1 text-center text-muted">
            Perfect 5th
          </span>
          <span className="rounded-md bg-background px-2 py-1 text-center text-muted">
            Octave
          </span>
        </div>
      </>
    ),
  },
  {
    href: "/random-metric-modulation",
    content: (
      <>
        <PreviewLabel icon={MetricModulationIcon}>Polyrhythm</PreviewLabel>
        <p className="mt-2 flex items-center justify-center gap-2 text-lg font-bold tabular-nums">
          120 <span className="text-sm text-accent">&rarr;</span> 180
        </p>
        <p className="text-center text-[0.65rem] text-muted">3:2 polyrhythm</p>
      </>
    ),
  },
];

/** Scattered on larger screens (an absolutely-positioned cluster around the hero tile, echoing
    the reference design's floating widget photos); a plain, un-rotated 2-column grid on narrow
    screens instead, where absolute positioning would be fragile and there's no room to scatter
    anything. Both read from the same `PREVIEWS` content, so there's exactly one place each tool's
    preview is actually drawn. */
function PreviewCluster() {
  return (
    <>
      <div className="relative mx-auto mt-4 hidden h-[26rem] w-full max-w-2xl sm:block">
        {/* The centering offset lives on this wrapper, not the card itself — the card's own
            hover lift (`hover:-translate-y-1` in PreviewCard) sets the same CSS transform
            variable Tailwind uses for `-translate-y-1/2`, so putting both on one element would
            have hovering *replace* the −50% centering with the much smaller hover offset, a jump
            down of about half the card's height instead of a lift. */}
        <div className="absolute left-1/2 top-1/2 w-52 -translate-x-1/2 -translate-y-1/2">
          <PreviewCard href={PREVIEWS[0].href} hero>
            {PREVIEWS[0].content}
          </PreviewCard>
        </div>
        <PreviewCard
          href={PREVIEWS[1].href}
          className="absolute left-0 top-2 w-40 -rotate-6"
        >
          {PREVIEWS[1].content}
        </PreviewCard>
        <PreviewCard
          href={PREVIEWS[2].href}
          className="absolute right-0 top-10 w-40 rotate-3"
        >
          {PREVIEWS[2].content}
        </PreviewCard>
        <PreviewCard
          href={PREVIEWS[3].href}
          className="absolute bottom-8 left-6 w-40 rotate-2"
        >
          {PREVIEWS[3].content}
        </PreviewCard>
        <PreviewCard
          href={PREVIEWS[4].href}
          className="absolute bottom-0 right-8 w-40 -rotate-3"
        >
          {PREVIEWS[4].content}
        </PreviewCard>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <PreviewCard href={PREVIEWS[0].href} hero className="col-span-2">
          {PREVIEWS[0].content}
        </PreviewCard>
        {PREVIEWS.slice(1).map((p) => (
          <PreviewCard key={p.href} href={p.href}>
            {p.content}
          </PreviewCard>
        ))}
      </div>
    </>
  );
}

/** The home page — an actual landing page, not a directory. Every tool still lives in the sidebar
    and the `/` command palette (`components/tools.tsx`'s `NAV_LINKS`) — this page's job is to
    make the case for the site, not index it. Shows "Welcome back, {name}" once signed in —
    `user.name` (only ever set by Google sign-in) if there is one, `user.email` otherwise, since
    every account has one of those but not necessarily both; nothing renders until both
    `useConvexAuth()` and the user query have actually resolved, so a signed-in visitor never sees
    a flash of the signed-out version first.

    Per a direct follow-up request with a reference screenshot (another site's own landing page,
    used purely as a layout reference, not copied): the hero's call-to-action buttons became a
    real search trigger (opens the same `/` command palette every tool already uses), and the
    reference's floating product photos became `PreviewCluster`'s small, clickable tool previews
    instead. */
export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const greetingName =
    isAuthenticated && user ? (user.name ?? user.email) : null;

  function openSearch() {
    window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-5 pb-20 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 lg:pt-20">
        <section className="flex flex-col items-center gap-6 text-center">
          {greetingName && (
            <p className="text-sm font-medium text-accent">
              Welcome back, {greetingName}
            </p>
          )}

          <Wordmark
            size="lg"
            heading
            className="h-28 w-full max-w-sm justify-center sm:h-32"
            textClassName="text-6xl leading-[0.95] sm:text-7xl"
          />

          <p className="max-w-md text-lg text-muted">
            Level up your playing with advanced, customizable practice tools.
          </p>

          <button
            type="button"
            onClick={openSearch}
            className="flex w-full max-w-sm items-center gap-2 rounded-full bg-surface px-5 py-3 text-left text-muted shadow-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SearchIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Search tools, tunes, trainers&hellip;
            </span>
            <kbd className="hidden shrink-0 rounded bg-background px-2 py-1 font-sans text-xs font-medium text-foreground lg:inline">
              /
            </kbd>
          </button>

          <PreviewCluster />
        </section>

        <section className="border-l-2 border-accent/30 pl-5 text-left">
          <p className="text-lg leading-relaxed text-foreground/90">
            Sheddex is built to be a free all-in-one solution to practice tools. My goal is to keep Sheddex distraction free; there will never be ads, popups, or paywalls. That being said, servers are not free, so if you&apos;re feeling generous please consider donating!
          </p>
          <a
            href="https://buymeacoffee.com/jackmechem"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M4 3.5c-.55 0-1 .45-1 1v1c0 3.75 2.6 6.89 6.09 7.73l-.34 1.76H6a.75.75 0 000 1.5h1.44l-.32 1.66A2 2 0 009.08 19.5h5.84a2 2 0 001.96-1.85l.32-1.65H18a.75.75 0 000-1.5h-1.75l-.34-1.76C19.4 12.4 22 9.26 22 5.5v-1c0-.55-.45-1-1-1H4zm14.9 2.5c-.29 2.6-2.12 4.72-4.55 5.42L15 5.5zM9 5.5l.65 5.92C7.22 10.72 5.38 8.6 5.1 6H9z" />
            </svg>
            Buy me a coffee
          </a>
        </section>

        <section className="text-left">
          <p className="text-sm text-muted">
            Make an account if you want your tune lists and settings to
            follow you to another device, or want a public profile other
            musicians can find on the{" "}
            <Link href="/community" className="text-accent hover:underline font-bold">
              Community
            </Link>
            . Your data will never be sold and never leaves our servers.
          </p>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-2 pb-6 px-2 text-center text-md text-muted">
        <p className="text-accent">
          Built with <span className="text-accent text-lg">♥</span> for musicians, by
          musicians.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>
            Made by{" "}
            <a
              href="https://jackmechem.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              Jack Mechem
            </a>
          </span>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/JackMechem/sheddex.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M12 .5a11.5 11.5 0 00-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0012 .5z" />
            </svg>
            GitHub
          </a>
          <span aria-hidden>·</span>
          <Link
            href="/privacy"
            className="font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/terms"
            className="font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/credits"
            className="font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Credits
          </Link>
        </div>
      </footer>
    </div>
  );
}
