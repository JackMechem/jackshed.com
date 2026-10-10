"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { tuneSummary } from "@/components/library/shared";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import {
  ChevronRightIcon,
  ChordChartIcon,
  CloseIcon,
  NAV_LINKS,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SetlistIcon,
  StarIcon,
  StopwatchIcon,
  groupByCategory,
} from "@/components/tools";
import { filterNavLinks } from "@jam-practice/core/navLinks";
import { CHORD_QUALITIES } from "@/lib/chords";
import { INTERVALS } from "@/lib/intervals";
import { getSnapshot as getTimerSnapshot, getServerSnapshot as getTimerServerSnapshot, subscribe as subscribeTimer } from "@/lib/practiceTimerEngine";
import { describeSession } from "@/lib/practiceTimer";
import { useRecentCharts, useRecentTunes } from "@/lib/recents";
import { attempts, rankWeak, type GradeCounts } from "@/lib/struggleStats";
import { useRecentTools } from "@/lib/toolRecents";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { usePracticeSessions } from "@/lib/usePracticeSessions";
import { useSetlists } from "@/lib/useSetlists";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

type ToolLink = (typeof NAV_LINKS)[number];
type Icon = ToolLink["icon"];

/** Community, Tunes and Chord Charts are "your library", not tools (the sidebar shows them apart too). */
const LIBRARY_HREFS = ["/community", "/tunes", "/chord-charts"];
const TOOLS = NAV_LINKS.filter((l) => !LIBRARY_HREFS.includes(l.href) && l.href !== "/");
const TOOL_BY_HREF = new Map(TOOLS.map((l) => [l.href, l]));
/** Shown in place of Favorites until you've starred some tools. */
const STARTER_HREFS = ["/metronome", "/jam-practice", "/tuner", "/practice-timer"];

// Only the struggle stats are read from the ear trainers' synced settings (never written here).
const INTERVAL_STATS_DEFAULTS = { intervalStats: {} as Record<string, GradeCounts> };
const CHORD_STATS_DEFAULTS = { chordStats: {} as Record<string, GradeCounts> };

const noop = () => () => {};
/** Today's date as a stable string, read on the client only (the server's clock and timezone
    would cause a hydration mismatch). */
function useToday(): string | null {
  return useSyncExternalStore(noop, () => new Date().toDateString(), () => null);
}

function greeting(today: string | null) {
  if (!today) return "Welcome back";
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * Home: the app's dashboard (the sidebar's "Dashboard"; the logo goes to the landing page).
 * A greeting and search on top, then a grid of cards built from what you actually have: where
 * you left off, a tune of the day from your list, pinned tools, your library at a glance,
 * setlists, practice sessions (or the running one), your ear-training weak spots, and every
 * tool in a compact launcher. The search finds tools and your tunes.
 */
export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const isDesktop = useIsDesktop();
  const today = useToday();
  const [query, setQuery] = useState("");
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const { favorites, toggleFavorite } = useFavorites();
  const recentTools = useRecentTools();
  const recentTunes = useRecentTunes();
  const recentCharts = useRecentCharts();
  const lists = useTuneLists();
  const { setlists } = useSetlists();
  const { allSongs, totalSongs, playlists } = useChordChartsLibrary(null);
  const { sessions } = usePracticeSessions();
  const timer = useSyncExternalStore(subscribeTimer, getTimerSnapshot, getTimerServerSnapshot);
  const [{ intervalStats }] = useSyncedSettings("jam-practice-guess-the-interval", INTERVAL_STATS_DEFAULTS);
  const [{ chordStats }] = useSyncedSettings("jam-practice-guess-the-chord", CHORD_STATS_DEFAULTS);

  const q = query.trim();
  const known = lists.tunes.tunes;
  const learning = lists.learn.tunes;

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
  const canStar = isAuthenticated;

  // Where you left off: recent tools, then recent tunes and charts.
  const recents: { key: string; icon: Icon; title: string; detail: string; href: string }[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    if (tool) recents.push({ key: href, icon: tool.icon, title: tool.label, detail: "Tool", href });
    if (recents.length >= 4) break;
  }
  for (const id of recentTunes.ids.slice(0, 2)) {
    const list = (["tunes", "learn"] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === id));
    const tune = list ? lists[list].tunes.find((t) => t.id === id) : undefined;
    if (list && tune) recents.push({ key: `t:${id}`, icon: NoteIcon, title: tune.name, detail: "Tune", href: tuneHref(list, id) });
  }
  for (const id of recentCharts.ids.slice(0, 2)) {
    const meta = chartMeta.get(id);
    if (meta) recents.push({ key: `c:${id}`, icon: ChordChartIcon, title: meta.title, detail: meta.key ? `Chart · ${meta.key}` : "Chart", href: `/chord-charts/view?id=${encodeURIComponent(id)}` });
  }

  // Tune of the day: the same one all day, from Tunes I Know.
  const tuneOfDay = useMemo(() => {
    if (!today || !known.length) return null;
    const day = Math.floor(new Date(today).getTime() / 86400000);
    const tune = known[day % known.length];
    const keys = tune.keys.filter((k) => k.enabled);
    const tempos = tune.tempos.filter((t) => t.enabled);
    return { tune, key: keys.length ? keys[day % keys.length].value : null, tempo: tempos.length ? tempos[day % tempos.length].value : null };
  }, [today, known]);

  const weakSpots = [
    ...rankWeak(intervalStats).flatMap((e) => {
      const iv = INTERVALS.find((i) => i.id === e.key);
      return iv ? [{ key: `i:${e.key}`, label: iv.label, kind: "Interval", counts: e.counts, score: e.score, href: "/guess-the-interval" }] : [];
    }),
    ...rankWeak(chordStats).flatMap((e) => {
      const cq = CHORD_QUALITIES.find((c) => c.id === e.key);
      return cq ? [{ key: `c:${e.key}`, label: `${cq.name} chords`, kind: "Chord", counts: e.counts, score: e.score, href: "/guess-the-chord" }] : [];
    }),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const name = profile?.username || user?.name?.split(" ")[0];
  const toolMatches = q ? filterNavLinks(TOOLS, q) : [];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{today ? new Date(today).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : " "}</p>
            <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {isAuthenticated ? `${greeting(today)}${name ? `, ${name}` : ""}` : "Your practice space"}
            </h1>
          </div>
          <label className="flex w-full items-center gap-2.5 rounded-full bg-surface pl-4 pr-1 focus-within:ring-2 focus-within:ring-accent md:w-80">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools and tunes…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </label>
        </header>

        {q ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Tools">
              {toolMatches.length ? <ToolRows items={toolMatches} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} /> : <Empty>No tools match “{q}”.</Empty>}
            </Card>
            <Card title="Your tunes">
              {tuneMatches.length ? (
                <div className="-mx-2 flex flex-col">
                  {tuneMatches.map(({ tune, list }) => (
                    <Link key={tune.id} href={tuneHref(list, tune.id)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
                      <IconChip icon={NoteIcon} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{tune.name}</span>
                        <span className="block truncate text-xs text-muted">{[list === "learn" ? "To learn" : "I know", tuneSummary(tune)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty>No tunes match.</Empty>
              )}
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Where you left off */}
            <section className="flex flex-col gap-4 rounded-3xl bg-accent/10 p-5 ring-1 ring-accent/15 lg:col-span-8">
              <h2 className="text-sm font-semibold text-muted">Pick up where you left off</h2>
              {recents.length ? (
                <>
                  <Link href={recents[0].href} className="group flex items-center gap-4 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-hover">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                      {(() => {
                        const I = recents[0].icon;
                        return <I className="h-7 w-7" />;
                      })()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xl font-bold">{recents[0].title}</span>
                      <span className="block text-sm text-muted">{recents[0].detail}</span>
                    </span>
                    <span className="hidden items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground sm:flex">
                      Resume <ChevronRightIcon className="h-4 w-4" />
                    </span>
                  </Link>
                  {recents.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {recents.slice(1, 7).map((r) => (
                        <Link key={r.key} href={r.href} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-surface/70 px-3 py-2.5 transition-colors hover:bg-surface">
                          <r.icon className="h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{r.title}</span>
                            <span className="block truncate text-xs text-muted">{r.detail}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-2xl bg-surface p-4 text-sm text-muted">The tools, tunes and charts you open will show up here.</p>
              )}
            </section>

            {/* Tune of the day */}
            <Card title="Tune of the day" className="lg:col-span-4" action={tuneOfDay ? { label: "Shuffle in Jam Practice", href: "/jam-practice" } : undefined}>
              {tuneOfDay ? (
                <div className="flex flex-1 flex-col justify-between gap-4">
                  <div>
                    <Link href={tuneHref("tunes", tuneOfDay.tune.id)} className="block text-2xl font-bold leading-tight tracking-tight hover:underline">
                      {tuneOfDay.tune.name}
                    </Link>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tuneOfDay.key && <Chip>in {tuneOfDay.key}</Chip>}
                      {tuneOfDay.tempo && <Chip>{tuneOfDay.tempo} BPM</Chip>}
                      <Chip muted>{tuneOfDay.tune.timeSignature}</Chip>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={tuneHref("tunes", tuneOfDay.tune.id)} className="flex items-center justify-center gap-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover">
                      Open the tune <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                    <p className="text-center text-xs text-muted">A new one from Tunes I Know every day.</p>
                  </div>
                </div>
              ) : (
                <Empty>
                  Add the tunes you know and one comes up here each day.{" "}
                  <Link href="/tunes" className="font-semibold text-accent hover:underline">Add tunes</Link>
                </Empty>
              )}
            </Card>

            {/* Pinned tools */}
            <Card
              title={favoriteTools.length ? "Favorites" : "Get started"}
              detail={favoriteTools.length || !canStar ? undefined : "Star a tool to pin it here"}
              className="lg:col-span-8"
            >
              {/* Cards keep their natural height (no stretching to match the card beside this one);
                  one or two favorites stack in a single column instead of a half-empty row. */}
              <div className={`grid auto-rows-fr content-start gap-3 ${pinned.length > 2 ? "sm:grid-cols-2" : ""}`}>
                {pinned.map((item) => (
                  <ToolTile key={item.href} item={item} favorited={favorites.includes(item.href)} canStar={canStar} onToggle={() => toggleFavorite(item.href)} />
                ))}
              </div>
              {favoriteTools.length > 0 && favoriteTools.length < 3 && (
                <p className="mt-auto flex items-center gap-1.5 text-xs text-muted">
                  <StarIcon className="h-3.5 w-3.5" /> Star more tools in the sidebar or below to pin them here.
                </p>
              )}
            </Card>

            {/* Library */}
            <Card title="Your library" className="lg:col-span-4">
              <div className="-mx-2 flex flex-col">
                <StatRow icon={NoteIcon} label="Tunes I know" value={known.length} href="/tunes/list?list=tunes" />
                <StatRow icon={NoteIcon} label="Tunes to learn" value={learning.length} href="/tunes/list?list=learn" />
                <StatRow icon={SetlistIcon} label="Setlists" value={setlists.length} href="/tunes/setlists" />
                <StatRow icon={ChordChartIcon} label="Chord charts" value={totalSongs} href="/chord-charts" detail={playlists.length ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}` : undefined} />
              </div>
            </Card>

            {/* Setlists */}
            <Card title="Setlists" className="lg:col-span-4" action={{ label: setlists.length ? "All" : "New", href: "/tunes/setlists" }}>
              {setlists.length ? (
                <div className="-mx-2 flex flex-col">
                  {[...setlists]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 4)
                    .map((s) => (
                      <Link key={s.id} href={`/tunes/setlist?id=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
                        <IconChip icon={SetlistIcon} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                        <span className="text-xs tabular-nums text-muted">{s.tuneIds.length} tunes</span>
                      </Link>
                    ))}
                </div>
              ) : (
                <Empty>
                  Put tunes in order for a gig or a session, with the key and tempo for each.{" "}
                  <Link href="/tunes/setlists" className="font-semibold text-accent hover:underline">Make a setlist</Link>
                </Empty>
              )}
            </Card>

            {/* Practice sessions, or the one running now */}
            <Card title={timer ? "Practicing now" : "Practice sessions"} className="lg:col-span-4" action={{ label: "Open timer", href: "/practice-timer" }}>
              {timer ? (
                <div className="-mx-1">
                  <PracticeTimerWidget />
                </div>
              ) : sessions.length ? (
                <div className="-mx-2 flex flex-col">
                  {sessions.slice(0, 4).map((s) => (
                    <Link key={s.id} href="/practice-timer" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
                      <IconChip icon={StopwatchIcon} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{s.name || "Untitled session"}</span>
                        <span className="block truncate text-xs text-muted">{describeSession(s)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty>
                  Chain timed blocks (scales, then tunes, then a break) or run a Pomodoro.{" "}
                  <Link href="/practice-timer" className="font-semibold text-accent hover:underline">Plan a session</Link>
                </Empty>
              )}
            </Card>

            {/* Ear training weak spots */}
            <Card title="Ear training weak spots" className="lg:col-span-4">
              {weakSpots.length ? (
                <div className="flex flex-col gap-3">
                  {weakSpots.map((w) => {
                    const total = attempts(w.counts);
                    const pct = total ? Math.round(((w.counts.correct + w.counts.partial * 0.5) / total) * 100) : 0;
                    return (
                      <Link key={w.key} href={w.href} className="group flex flex-col gap-1.5">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-semibold group-hover:underline">{w.label}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{pct}% of {total}</span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-background">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 4)}%` }} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty>
                  Play a few rounds of{" "}
                  <Link href="/guess-the-interval" className="font-semibold text-accent hover:underline">Guess the Interval</Link> or{" "}
                  <Link href="/guess-the-chord" className="font-semibold text-accent hover:underline">Guess the Chord</Link> and the ones you miss most show up here.
                </Empty>
              )}
            </Card>

            {/* Every tool */}
            <section className="rounded-3xl bg-surface p-5 lg:col-span-12">
              <h2 className="mb-4 text-sm font-semibold text-muted">All tools</h2>
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
                {groupByCategory(TOOLS).map(({ category, items }) => (
                  <div key={category} className="min-w-0">
                    <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{category}</h3>
                    <ToolRows items={items} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <section className="mt-6 flex flex-col items-start gap-4 rounded-3xl border border-foreground/[0.06] p-5 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-muted">
            sheddex is free, with no ads, popups or paywalls, and it&apos;ll stay that way. Servers aren&apos;t free, so if you&apos;re feeling generous, consider chipping in.
          </p>
          <a
            href="https://buymeacoffee.com/jackmechem"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            Buy me a coffee
          </a>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 pb-6 text-center text-sm text-muted">
        <span>
          Made by{" "}
          <a href="https://jackmechem.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Jack Mechem
          </a>
        </span>
        <a href="https://github.com/JackMechem/sheddex.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
        <Link href="/" className="hover:text-foreground">About</Link>
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/credits" className="hover:text-foreground">Credits</Link>
      </footer>
    </div>
  );
}

function Card({
  title,
  detail,
  action,
  className = "",
  children,
}: {
  title: string;
  detail?: string;
  action?: { label: string; href: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-3xl bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {detail && <span className="truncate text-xs text-muted/80">· {detail}</span>}
        {action && (
          <Link href={action.href} className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-semibold text-accent hover:underline">
            {action.label === "New" && <PlusIcon className="h-3.5 w-3.5" />}
            {action.label}
            {action.label !== "New" && <ChevronRightIcon className="h-3.5 w-3.5" />}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

function Chip({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${muted ? "bg-background text-muted" : "bg-accent/15 text-accent"}`}>{children}</span>;
}

function IconChip({ icon: I }: { icon: Icon }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
      <I className="h-4 w-4" />
    </span>
  );
}

function StatRow({ icon, label, value, href, detail }: { icon: Icon; label: string; value: number; href: string; detail?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
      <IconChip icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      <span className="text-xl font-extrabold tabular-nums">{value}</span>
    </Link>
  );
}

function Star({ label, favorited, onToggle, small }: { label: string; favorited: boolean; onToggle: () => void; small?: boolean }) {
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
      className={`flex shrink-0 items-center justify-center rounded-full hover:bg-background ${small ? "h-7 w-7" : "h-8 w-8"} ${favorited ? "text-accent" : "text-muted hover:text-foreground"}`}
    >
      <StarIcon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} filled={favorited} />
    </button>
  );
}

/** A card for a favorite (or starter) tool: icon, name, what it does. */
function ToolTile({ item, favorited, canStar, onToggle }: { item: ToolLink; favorited: boolean; canStar: boolean; onToggle: () => void }) {
  return (
    <div className="relative h-full">
      <Link
        href={item.href}
        className="group flex h-full items-center gap-4 rounded-2xl bg-background p-4 ring-1 ring-transparent transition hover:ring-accent/30 active:scale-[0.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition group-hover:bg-accent group-hover:text-accent-foreground">
          <item.icon className="h-6 w-6" />
        </span>
        <span className={`min-w-0 flex-1 ${canStar ? "pr-6" : ""}`}>
          <span className="block truncate font-semibold">{item.label}</span>
          {item.description && <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{item.description}</span>}
        </span>
      </Link>
      {canStar && (
        <div className="absolute right-2 top-2">
          <Star small label={item.label} favorited={favorited} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

/** Compact tool rows for the launcher and search results: icon, name, a ☆ to favorite (signed in). */
function ToolRows({ items, favorites, canStar, isDesktop, onToggle }: { items: ToolLink[]; favorites: string[]; canStar: boolean; isDesktop: boolean; onToggle: (href: string) => void }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const disabled = !!item.desktopOnly && !isDesktop;
        return (
          <div key={item.href} className={`group flex items-center rounded-xl ${disabled ? "opacity-50" : "hover:bg-surface-hover"}`}>
            {disabled ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-sm" title="Desktop only">
                <item.icon className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate">{item.label}</span>
              </span>
            ) : (
              <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-sm">
                <item.icon className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate">{item.label}</span>
              </Link>
            )}
            {canStar && (
              <span className={favorites.includes(item.href) ? "" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100"}>
                <Star small label={item.label} favorited={favorites.includes(item.href)} onToggle={() => onToggle(item.href)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
