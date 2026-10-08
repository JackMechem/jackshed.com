"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { tuneSummary } from "@/components/library/shared";
import Logo from "@/components/Logo";
import {
  ChordChartIcon,
  ChevronRightIcon,
  CloseIcon,
  NAV_LINKS,
  NoteIcon,
  SearchIcon,
  SetlistIcon,
  StarIcon,
  groupByCategory,
} from "@/components/tools";
import { filterNavLinks } from "@jam-practice/core/navLinks";
import { useRecentCharts, useRecentTunes } from "@/lib/recents";
import { useRecentTools } from "@/lib/toolRecents";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useSetlists } from "@/lib/useSetlists";

type ToolLink = (typeof NAV_LINKS)[number];

/** Community, Tunes and Chord Charts are "Your library", not tools (the sidebar shows them apart too). */
const LIBRARY_HREFS = ["/community", "/tunes", "/chord-charts"];
const TOOLS = NAV_LINKS.filter((l) => !LIBRARY_HREFS.includes(l.href));
const TOOL_BY_HREF = new Map(TOOLS.map((l) => [l.href, l]));
/** Shown in place of Favorites until you've starred some tools. */
const STARTER_HREFS = ["/metronome", "/jam-practice", "/tuner", "/practice-timer"];

/**
 * Home — an overview with the tools front and centre, matching the mobile app's Home: your
 * favorite tools as big cards (a starter set until you star some), "Jump back in" (the tools,
 * tunes and charts you opened last), your library at a glance (tunes, setlists, charts — each
 * opening its page), then every tool by category. The search finds tools and your tunes. Signed
 * out, a line under the logo says what sheddex is; the donation note and footer stay at the bottom.
 */
export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const { favorites, toggleFavorite } = useFavorites();
  const recentTools = useRecentTools();
  const recentTunes = useRecentTunes();
  const recentCharts = useRecentCharts();
  const lists = useTuneLists();
  const { setlists } = useSetlists();
  const { allSongs, totalSongs } = useChordChartsLibrary(null);

  const q = query.trim();
  const chartMeta = useMemo(() => {
    const m = new Map<string, { title: string; key: string }>();
    for (const s of allSongs) m.set(s.id, { title: s.title, key: s.key });
    return m;
  }, [allSongs]);

  const tuneMatches = useMemo(() => {
    if (!q) return [];
    const words = q.toLowerCase().split(/\s+/);
    const out: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ["tunes", "learn"] as TuneListId[]) {
      for (const tune of lists[list].tunes) if (words.every((w) => tune.name.toLowerCase().includes(w))) out.push({ tune, list });
    }
    return out.slice(0, 8);
  }, [q, lists]);

  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : TOOLS.filter((t) => STARTER_HREFS.includes(t.href));

  // "Jump back in": recent tools first, then recent tunes and charts.
  const jumpCards: { key: string; icon: ToolLink["icon"]; title: string; detail: string; href: string }[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    if (tool) jumpCards.push({ key: href, icon: tool.icon, title: tool.label, detail: "Tool", href });
    if (jumpCards.length >= 4) break;
  }
  for (const id of recentTunes.ids) {
    if (jumpCards.length >= 7) break;
    const list = (["tunes", "learn"] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === id));
    const tune = list ? lists[list].tunes.find((t) => t.id === id) : undefined;
    if (list && tune) jumpCards.push({ key: `t:${id}`, icon: NoteIcon, title: tune.name, detail: "Tune", href: tuneHref(list, id) });
  }
  for (const id of recentCharts.ids) {
    if (jumpCards.length >= 10) break;
    const meta = chartMeta.get(id);
    if (meta) jumpCards.push({ key: `c:${id}`, icon: ChordChartIcon, title: meta.title, detail: meta.key ? `Chart · ${meta.key}` : "Chart", href: `/chord-charts/view?id=${encodeURIComponent(id)}` });
  }

  const toolMatches = q ? filterNavLinks(TOOLS, q) : [];
  const canStar = isAuthenticated;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12">
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1>
              <Logo height={40} />
            </h1>
            {!isAuthenticated && <p className="text-muted">Advanced, customizable practice tools — free, with no ads or paywalls.</p>}
          </div>
          <label className="flex items-center gap-2.5 rounded-full bg-surface pl-4 pr-1 focus-within:ring-2 focus-within:ring-accent">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools and tunes…"
              className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </label>
        </header>

        {q ? (
          <>
            <Section title="Tools">
              {toolMatches.length ? <ToolList items={toolMatches} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} /> : <Muted>No tools match “{q}”.</Muted>}
            </Section>
            <Section title="Your tunes">
              {tuneMatches.length ? (
                <div className="overflow-hidden rounded-2xl bg-surface">
                  {tuneMatches.map(({ tune, list }, i) => (
                    <Link key={tune.id} href={tuneHref(list, tune.id)} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover ${i ? "border-t border-background" : ""}`}>
                      <NoteIcon className="h-4 w-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{tune.name}</span>
                        <span className="block truncate text-xs text-muted">{[list === "learn" ? "To learn" : "I know", tuneSummary(tune)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Muted>No tunes match.</Muted>
              )}
            </Section>
          </>
        ) : (
          <>
            <Section title={favoriteTools.length ? "Favorites" : "Get started"} detail={favoriteTools.length || !canStar ? undefined : "Click ☆ on a tool to pin it here"}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pinned.map((item) => (
                  <ToolTile key={item.href} item={item} favorited={favorites.includes(item.href)} canStar={canStar} onToggle={() => toggleFavorite(item.href)} />
                ))}
              </div>
            </Section>

            {jumpCards.length > 0 && (
              <Section title="Jump back in">
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                  {jumpCards.map((c) => (
                    <Link key={c.key} href={c.href} className="flex h-28 w-40 shrink-0 flex-col justify-between rounded-2xl bg-surface p-3 transition-colors hover:bg-surface-hover">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <c.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{c.title}</span>
                        <span className="block truncate text-xs text-muted">{c.detail}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Your library">
              <div className="grid grid-cols-3 gap-3">
                <LibraryCard icon={NoteIcon} count={lists.tunes.tunes.length + lists.learn.tunes.length} label="Tunes" href="/tunes" />
                <LibraryCard icon={SetlistIcon} count={setlists.length} label="Setlists" href={setlists.length ? "/tunes/setlists" : "/tunes"} />
                <LibraryCard icon={ChordChartIcon} count={totalSongs} label="Charts" href="/chord-charts" />
              </div>
            </Section>

            <div className="grid gap-8 md:grid-cols-2">
              {groupByCategory(TOOLS).map(({ category, items }) => (
                <Section key={category} title={category}>
                  <ToolList items={items} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} />
                </Section>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-8">
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
        </div>
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

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-xl font-bold">{title}</h2>
        {detail && <span className="truncate text-xs text-muted">{detail}</span>}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{children}</p>;
}

function Star({ label, favorited, onToggle }: { label: string; favorited: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={favorited ? `Unfavorite ${label}` : `Favorite ${label}`}
      aria-pressed={favorited}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-background ${favorited ? "text-accent" : "text-muted hover:text-foreground"}`}
    >
      <StarIcon className="h-4 w-4" filled={favorited} />
    </button>
  );
}

/** A big card for a favorite (or starter) tool. */
function ToolTile({ item, favorited, canStar, onToggle }: { item: ToolLink; favorited: boolean; canStar: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Link href={item.href} className="flex h-32 flex-col justify-between rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-hover">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <item.icon className="h-5 w-5" />
        </span>
        <span className="pr-6 font-bold leading-tight">{item.label}</span>
      </Link>
      {canStar && (
        <div className="absolute right-2 top-2">
          <Star label={item.label} favorited={favorited} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

/** One category's tools as rows — icon, name, a ☆ to favorite (signed in). */
function ToolList({ items, favorites, canStar, isDesktop, onToggle }: { items: ToolLink[]; favorites: string[]; canStar: boolean; isDesktop: boolean; onToggle: (href: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      {items.map((item, i) => {
        const disabled = !!item.desktopOnly && !isDesktop;
        return (
          <div key={item.href} className={`flex items-center gap-1 pr-2 ${i ? "border-t border-background" : ""} ${disabled ? "opacity-50" : "hover:bg-surface-hover"}`}>
            {disabled ? (
              <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3" title="Desktop only">
                <item.icon className="h-5 w-5 shrink-0 text-accent" />
                <span className="truncate">{item.label}</span>
                <span className="text-xs text-muted">Desktop only</span>
              </span>
            ) : (
              <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                <item.icon className="h-5 w-5 shrink-0 text-accent" />
                <span className="truncate">{item.label}</span>
              </Link>
            )}
            {canStar && <Star label={item.label} favorited={favorites.includes(item.href)} onToggle={() => onToggle(item.href)} />}
          </div>
        );
      })}
    </div>
  );
}

function LibraryCard({ icon: Icon, count, label, href }: { icon: ToolLink["icon"]; count: number; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-hover">
      <span className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-accent" />
        <ChevronRightIcon className="h-4 w-4 text-muted" />
      </span>
      <span>
        <span className="block text-2xl font-extrabold tabular-nums">{count}</span>
        <span className="block truncate text-xs font-semibold text-muted">{label}</span>
      </span>
    </Link>
  );
}
