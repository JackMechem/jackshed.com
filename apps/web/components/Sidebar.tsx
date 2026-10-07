"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import AccountMenu from "@/components/AccountMenu";
import { OPEN_PALETTE_EVENT } from "@/components/CommandPalette";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import ThemeModal from "@/components/ThemeModal";
import Wordmark from "@/components/Wordmark";
import {
  CATEGORY_ICONS,
  NAV_LINKS,
  SearchIcon,
  StarIcon,
  filterLinks,
  groupByCategory,
  svgProps,
} from "@/components/tools";
import { useCollapsedCategories } from "@/lib/panels";
import { collectLeaves, createLeaf } from "@/lib/tilingLayout";
import { TILEABLE_LINKS, TOOL_COMPONENTS } from "@/lib/toolRegistry";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { updateTilingState, useTilingState } from "@/lib/useTilingLayout";

const STORAGE_KEY = "jam-practice-sidebar";
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = 60;

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3a9 9 0 000 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.8-9-7.8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15.5" cy="7.5" r="1" />
    </svg>
  );
}

function ChevronsIcon({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg {...svgProps(className)} style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TilingIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18M3 12h9" />
    </svg>
  );
}

/** The sidebar's own "more options" trigger — three vertical dots, filled rather than stroked
    (every other icon in this file is an outlined `svgProps` icon, but a stroked dot at this size
    reads as a faint ring rather than a solid dot). */
function DotsIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function clamp(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

type Layout = { width: number; collapsed: boolean };

const DEFAULT_LAYOUT: Layout = { width: DEFAULT_WIDTH, collapsed: false };
const layoutListeners = new Set<() => void>();
let cachedLayout: Layout | null = null;

function getLayout(): Layout {
  if (cachedLayout) return cachedLayout;
  cachedLayout = DEFAULT_LAYOUT;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored) {
      cachedLayout = {
        width: typeof stored.width === "number" ? clamp(stored.width) : DEFAULT_WIDTH,
        collapsed: stored.collapsed === true,
      };
    }
  } catch {
    // ignore unreadable storage
  }
  return cachedLayout;
}

function getServerLayout(): Layout {
  return DEFAULT_LAYOUT;
}

function updateLayout(patch: Partial<Layout>) {
  cachedLayout = { ...getLayout(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedLayout));
  } catch {
    // storage unavailable
  }
  for (const listener of layoutListeners) listener();
}

function subscribeLayout(listener: () => void) {
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
}

/** The sidebar's current on-screen width in pixels (collapsed or not) — exported so
    `BackgroundToolDock.tsx` can anchor itself just to the right of the sidebar's own edge without
    duplicating this module's layout store. */
export function useSidebarShownWidth(): number {
  const { width, collapsed } = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  return collapsed ? COLLAPSED_WIDTH : width;
}

function SearchBox({
  query,
  onChange,
  onNavigate,
  large,
}: {
  query: string;
  onChange: (query: string) => void;
  onNavigate?: () => void;
  large?: boolean;
}) {
  const router = useRouter();

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onChange("");
    } else if (e.key === "Enter") {
      const first = filterLinks(query)[0];
      if (!first) return;
      router.push(first.href);
      onChange("");
      onNavigate?.();
    }
  }

  // On desktop the sidebar search is a button that opens the same menu as pressing "/".
  if (!large) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        aria-label="Search tools"
        className="mb-3 flex w-full items-center gap-2 rounded-full bg-background px-3 py-2 text-left text-sm text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">Press / to search</span>
      </button>
    );
  }

  return (
    <label
      className={`mb-3 flex items-center gap-2 rounded-full bg-background px-3 text-muted focus-within:ring-2 focus-within:ring-accent ${
        large ? "py-2.5 text-base" : "py-2 text-sm"
      }`}
    >
      <SearchIcon className="h-4 w-4 shrink-0" />
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={large ? "Search tools" : "Press / to search"}
        aria-label="Search tools"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
      />
    </label>
  );
}

type NavLink = (typeof NAV_LINKS)[number];

/** Shared by Favorites and every real category in `NavItems` below — a collapsible section with
    its own header (icon + title + chevron) and, while expanded, a subtle rounded background
    behind the whole block. `accent` is the one visual difference Favorites gets: a translucent
    *accent* tint instead of the plain `surface-hover` tint every other category uses, so it still
    reads as a distinct, special section rather than just another category. A module-level
    component (not a function defined inside `NavItems`'s own render, which the React Compiler
    correctly flags — a new component identity every render resets state), so everything it needs
    from `NavItems` is passed in explicitly instead of closed over. */
function CategoryBlock({
  title,
  icon: Icon,
  items,
  collapsed,
  large,
  searching,
  isCollapsed,
  onToggleCollapse,
  renderLink,
  accent,
}: {
  title: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  items: NavLink[];
  collapsed?: boolean;
  large?: boolean;
  searching: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  renderLink: (link: NavLink) => React.ReactNode;
  accent?: boolean;
}) {
  // A genuinely *expanded* section (not the icon-only sidebar, where everything always shows flat
  // with no header at all) gets its rounded backing — otherwise it'd blend into the plain sidebar
  // background the way a collapsed section does.
  const expanded = !collapsed && !isCollapsed;
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl pb-2 pt-1.5 transition-colors ${
        expanded ? (accent ? "bg-accent/20" : "bg-surface-hover/60") : ""
      }`}
    >
      {!collapsed &&
        (searching ? (
          <p
            className={`flex items-center gap-2 px-4 pb-1.5 pt-2 font-semibold text-muted/70 ${
              large ? "text-base" : "text-sm"
            }`}
          >
            <Icon className={large ? "h-6 w-6 shrink-0" : "h-5 w-5 shrink-0"} />
            {title}
          </p>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-4 pb-1.5 pt-2 font-semibold text-muted/70 transition-colors hover:text-foreground"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className={large ? "h-6 w-6 shrink-0" : "h-5 w-5 shrink-0"} />
              <span className={large ? "text-base" : "text-sm"}>{title}</span>
            </span>
            <ChevronDownIcon
              className={`h-3 w-3 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            />
          </button>
        ))}
      {!isCollapsed &&
        (collapsed ? (
          items.map(renderLink)
        ) : (
          // Indented, with a vertical rule down the left, so a section's own sub-options read as
          // nested under its title rather than sitting flush with it.
          <div className="ml-4 mr-2 flex flex-col gap-1 border-l border-surface-hover pl-2">
            {items.map(renderLink)}
          </div>
        ))}
    </div>
  );
}

function NavItems({
  collapsed,
  large,
  query = "",
  onNavigate,
}: {
  collapsed?: boolean;
  large?: boolean;
  query?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { favorites, toggleFavorite, isAuthenticated } = useFavorites();
  const [collapsedCategories, setCategoryCollapsed] = useCollapsedCategories();
  // Which link counts as "active" — normally just the real URL, but while "Advanced layouts" is
  // genuinely in effect (on, and desktop-sized — the same condition `AppShell.tsx` gates
  // `TilingLayout` on), focusing a different pane no longer moves Next's own `usePathname()` (see
  // `lib/useTilingLayout.ts`'s `syncAddressBar` for why — routing that through Next's router was
  // traced to a real pane-losing-its-state bug), so the sidebar has to read the *active pane's own
  // href* directly instead, or it would silently stop following pane focus changes.
  const tilingState = useTilingState();
  const isDesktop = useIsDesktop();
  const activePaneHref =
    tilingState.enabled && isDesktop && tilingState.tree && tilingState.activePaneId
      ? collectLeaves(tilingState.tree).find((l) => l.id === tilingState.activePaneId)?.href
      : undefined;
  const effectivePathname = activePaneHref ?? pathname;
  const filtered = filterLinks(query);
  // Community isn't a collapsible category like the others — a direct request to pull it out as
  // its own always-visible item right under the search box, since it's really just the one link,
  // not a group of tools the way every other category is.
  const communityItem = filtered.find((link) => link.category === "Community");
  const groups = groupByCategory(filtered.filter((link) => link.category !== "Community"));
  // A subset of `filtered`, in NAV_LINKS' own order (stable regardless of favoriting order) —
  // shown as a section of its own above the normal categories, where each item also still stays
  // in its own category below (a quick-access shortcut, not a "moved out of" relocation).
  const favoriteItems = isAuthenticated
    ? filtered.filter((link) => favorites.includes(link.href))
    : [];
  const searching = query.trim().length > 0;

  function renderLink({ href, label, icon: Icon, desktopOnly }: NavLink) {
    const active = effectivePathname === href;
    // On phones, tools that need a bigger screen are shown greyed out and can't be opened.
    if (large && desktopOnly) {
      return (
        <div
          key={href}
          aria-disabled="true"
          title="Needs a larger screen"
          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-muted opacity-40"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
          <span className="ml-auto text-xs font-normal">Desktop only</span>
        </div>
      );
    }

    // Room reserved on the right for the star, so it never overlaps the icon/label — reserved
    // whenever it *can* show (signed in, not collapsed), not just while actually hovered, so nothing
    // shifts around when it fades in.
    const showsStar = isAuthenticated && !collapsed;
    const link = (
      <Link
        href={href}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        className={`flex min-w-0 items-center gap-3 ${large ? "rounded-xl" : "rounded-lg"} px-3 font-medium transition-colors ${
          large ? "py-3 text-base" : "py-2 text-sm"
        } ${collapsed ? "justify-center" : "w-full"} ${showsStar ? (large ? "pr-14" : "pr-11") : ""} ${
          active
            ? "bg-accent/10 text-accent"
            : "text-muted hover:bg-surface-hover hover:text-foreground"
        }`}
      >
        <Icon className={large ? "h-5 w-5 shrink-0" : "h-4 w-4 shrink-0"} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );

    if (!showsStar) {
      return <div key={href}>{link}</div>;
    }
    // The star sits on top of the link's own right edge (visually "inside" the nav button, so the
    // button stays full width) rather than actually nested inside it — a <button> inside the <a>
    // next/link renders is invalid HTML and breaks click handling. It's a sibling in a `relative`
    // wrapper instead, absolutely positioned over the padding the link reserved for it above, and
    // stacked on top (`z-10`) so a click there hits the star, not the link underneath it.
    const isFavorite = favorites.includes(href);
    return (
      <div key={href} className="group relative flex items-center">
        {link}
        <button
          type="button"
          onClick={() => toggleFavorite(href)}
          aria-label={isFavorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
          aria-pressed={isFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={`absolute right-1 top-1/2 z-10 flex -translate-y-1/2 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-hover ${
            large ? "h-11 w-11" : "h-9 w-9"
          } ${isFavorite ? "text-accent" : "text-muted hover:text-foreground"} ${
            // An already-favorited star always stays visible (so you can see what's starred at a
            // glance); an unfavorited one only shows on hover on desktop (no hover on mobile, so
            // it's always visible there too). focus-visible keeps it reachable by keyboard even
            // without a mouse hovering it.
            large || isFavorite
              ? ""
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          }`}
        >
          <StarIcon className={large ? "h-5 w-5" : "h-4 w-4"} filled={isFavorite} />
        </button>
      </div>
    );
  }

  // Collapsing is a `!collapsed`-only (not icon-mode) concept, and a search in progress always
  // forces every section open — a collapsed one hiding its own search matches would just look
  // like the search was broken.
  function isSectionCollapsed(key: string) {
    return !collapsed && !searching && (collapsedCategories[key] ?? false);
  }

  return (
    <nav className="flex overflow-y-auto h-full flex-col gap-3">
      {groups.length === 0 && !communityItem && (
        <p className={`px-3 text-muted ${large ? "text-base" : "text-sm"}`}>No tools found</p>
      )}
      {communityItem && (
        <div className="flex flex-col gap-1 pb-2">{renderLink(communityItem)}</div>
      )}
      {favoriteItems.length > 0 && (
        <CategoryBlock
          title="Favorites"
          icon={(props) => <StarIcon {...props} filled />}
          items={favoriteItems}
          collapsed={collapsed}
          large={large}
          searching={searching}
          isCollapsed={isSectionCollapsed("Favorites")}
          onToggleCollapse={() =>
            setCategoryCollapsed("Favorites", !isSectionCollapsed("Favorites"))
          }
          renderLink={renderLink}
          accent
        />
      )}
      {groups.map(({ category, items }) => (
        <CategoryBlock
          key={category}
          title={category}
          icon={CATEGORY_ICONS[category]}
          items={items}
          collapsed={collapsed}
          large={large}
          searching={searching}
          isCollapsed={isSectionCollapsed(category)}
          onToggleCollapse={() => setCategoryCollapsed(category, !isSectionCollapsed(category))}
          renderLink={renderLink}
        />
      ))}
    </nav>
  );
}

/** Advanced-layouts toggle logic shared by the desktop and mobile options flyouts (mobile only
    ever reaches this via a href that's never actually reachable there — `AppShell.tsx` disables
    tiling outright below the `lg` breakpoint regardless — but the toggle itself is still harmless
    to expose, consistent with this being "the one place Advanced layouts lives" rather than
    special-casing mobile out of a shared helper for no real benefit).

    Turning it *on* also resets the pane tree to a single fresh pane right here, seeded from
    `usePathname()` — the page you're actually looking at this instant, not whatever was last
    saved. Fixes a real bug reported directly ("when I initially turned the feature on, the tool I
    was using stopped displaying and there was text saying 'unknown tool'"): `TilingLayout`'s own
    seeding effect only ever fires when there's *no* saved tree at all, so turning the feature back
    on after having used (and left) it earlier silently resumed whatever stale tree was last saved.
    Falls back to the first tileable tool (`TILEABLE_LINKS[0]`) if you happen to enable it from a
    page that isn't a tool at all (e.g. the home page). */
function toggleAdvancedLayouts(enabled: boolean, pathname: string) {
  if (enabled) {
    updateTilingState({ enabled: false });
    return;
  }
  const seedHref = TOOL_COMPONENTS[pathname] ? pathname : TILEABLE_LINKS[0].href;
  const root = createLeaf(seedHref);
  updateTilingState({ enabled: true, tree: root, activePaneId: root.id });
}

export default function Sidebar() {
  const { width, collapsed } = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const { enabled: tilingEnabled } = useTilingState();
  const pathname = usePathname();

  const setWidth = (w: number) => updateLayout({ width: clamp(w) });
  const setCollapsed = (c: boolean) => updateLayout({ collapsed: c });

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    if (collapsed) {
      updateLayout({ collapsed: false, width: MIN_WIDTH });
    }
  }

  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    setWidth(e.clientX - left);
  }

  function onKeyResize(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setWidth(width - 16);
    else if (e.key === "ArrowRight") setWidth(width + 16);
    else return;
    e.preventDefault();
  }

  const shownWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:hidden">
          <div className="mb-6 flex items-center justify-between gap-1">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              aria-label="sheddex home"
              className="min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Wordmark className="h-8" textClassName="text-xl" />
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <Flyout icon={DotsIcon} label="Menu options" align="end">
                {(close) => (
                  <FlyoutItem
                    icon={PaletteIcon}
                    label="Theme"
                    onSelect={() => {
                      setThemeOpen(true);
                      close();
                    }}
                  />
                )}
              </Flyout>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-hover"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <SearchBox
            large
            query={query}
            onChange={setQuery}
            onNavigate={() => setMobileOpen(false)}
          />
          {/* min-h-0 lets this shrink below its content's natural height (the flex-column
              default is min-height: auto, which would otherwise just grow the whole menu past
              the screen instead of scrolling) — needed now that the tool list is long enough to
              overflow a phone screen on its own. */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            <NavItems large query={query} onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="mt-1 flex flex-col gap-1 p-1 bg-background rounded-2xl">
            <PracticeTimerWidget />
            <AccountMenu large onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {themeOpen && <ThemeModal onClose={() => setThemeOpen(false)} />}

      <aside
        style={{ width: shownWidth }}
        className={`relative hidden shrink-0 flex-col bg-surface p-2 lg:flex ${
          dragging ? "" : "transition-[width] duration-150"
        }`}
      >
        <div
          className={
            collapsed
              ? "mb-4 flex h-10 items-center justify-center"
              : "mb-4 flex h-10 items-center justify-between gap-1 pl-1"
          }
        >
          {!collapsed && (
            <Link
              href="/"
              aria-label="sheddex home"
              className="min-w-0 flex-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Wordmark className="h-8" textClassName="text-lg" />
            </Link>
          )}
          <Flyout
            icon={DotsIcon}
            label="Sidebar options"
            align={collapsed ? "start" : "end"}
          >
            {(close) => (
              <>
                <FlyoutItem
                  icon={TilingIcon}
                  label="Advanced layouts"
                  checked={tilingEnabled}
                  onSelect={() => {
                    toggleAdvancedLayouts(tilingEnabled, pathname);
                    close();
                  }}
                />
                <FlyoutItem
                  icon={PaletteIcon}
                  label="Theme"
                  onSelect={() => {
                    setThemeOpen(true);
                    close();
                  }}
                />
                <FlyoutItem
                  icon={ChevronsIcon}
                  label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  onSelect={() => {
                    setCollapsed(!collapsed);
                    close();
                  }}
                />
              </>
            )}
          </Flyout>
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            aria-label="Search tools"
            title="Search tools"
            className="mb-3 flex items-center justify-center rounded-full px-3 py-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        ) : (
          <SearchBox query={query} onChange={setQuery} />
        )}
        <NavItems collapsed={collapsed} query={query} />
        {/* The grouping background/padding is only meaningful expanded — collapsed, with just an
            icon-sized widget and the avatar link stacked tightly, it read as an unwanted rounded
            box squeezed around the profile picture (reported directly, with a screenshot), so
            collapsed drops to a plain unboxed stack instead. */}
        <div
          className={`mt-1 flex flex-col gap-1 ${collapsed ? "" : "bg-background rounded-2xl p-1"}`}
        >
          <PracticeTimerWidget collapsed={collapsed} />
          <AccountMenu collapsed={collapsed} />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={shownWidth}
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={onKeyResize}
          className="group absolute -right-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none justify-center outline-none"
        >
          <div
            className={`h-full w-0.5 transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${
              dragging ? "bg-accent" : ""
            }`}
          />
        </div>
      </aside>
    </>
  );
}
