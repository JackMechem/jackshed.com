"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon, ChordChartIcon, DotsVerticalIcon, PlusIcon, SearchIcon } from "@/components/tools";
import { formatComposer } from "@/lib/iRealPro";
import type { Tune } from "@/lib/types";
import type { LibrarySongMeta } from "@/lib/useChordChartsLibrary";

/** Shared pieces of the Tunes and Chord Charts pages (`components/library/*`), modeled on the
    mobile app's Tunes and Chord Charts tabs. */

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full ${wide ? "max-w-5xl" : "max-w-4xl"} flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12`}
    >
      {children}
    </main>
  );
}

/** The "back" control above a page title (and in the setlist chart reader's header): a chevron +
    label pill. Pass `href` to make it a link instead of a button. */
export function BackButton({ onClick, href, label = "Back", className = "" }: { onClick?: () => void; href?: string; label?: string; className?: string }) {
  const cls = `-ml-2 inline-flex items-center gap-0.5 self-start rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground ${className}`;
  const inner = (
    <>
      <ChevronLeftIcon className="h-4 w-4" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: string; back?: () => void; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <BackButton onClick={back} className="mb-2" />
        )}
        <h1 className="truncate text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
      <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base outline-none"
      />
    </label>
  );
}

export function StatCard({ icon: Icon, count, label, href }: { icon: React.ComponentType<{ className?: string }>; count: number; label: string; href?: string }) {
  const body = (
    <>
      <Icon className="h-5 w-5 text-accent" />
      <div>
        <div className="text-2xl font-extrabold tabular-nums">{count}</div>
        <div className="truncate text-xs font-semibold text-muted">{label}</div>
      </div>
    </>
  );
  const cls = "flex flex-1 flex-col gap-2 rounded-2xl bg-surface p-4";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-surface-hover`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SectionHeader({
  title,
  detail,
  href,
  onAdd,
  addLabel,
}: {
  title: string;
  detail?: string;
  href?: string;
  /** Shows a small + next to the title — adds to this section. */
  onAdd?: (e: React.MouseEvent) => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel ?? `Add to ${title}`}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-accent hover:bg-surface-hover"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </div>
      {href && (
        <Link href={href} className="text-sm font-semibold text-accent hover:underline">
          See all ›
        </Link>
      )}
    </div>
  );
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface p-4 text-sm text-muted">{children}</div>;
}

/** A ⋮ button for a row — always visible on touch screens, on hover elsewhere. */
export function MenuButton({ label, onClick, alwaysVisible = false }: { label: string; onClick: (e: React.MouseEvent) => void; alwaysVisible?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={label}
      title="Options"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground focus-visible:opacity-100 ${
        alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      }`}
    >
      <DotsVerticalIcon className="h-4 w-4" />
    </button>
  );
}

export function ChartRow({ song, subtitle, href, onMenu }: { song: LibrarySongMeta; subtitle?: string; href: string; onMenu: (e: React.MouseEvent) => void }) {
  return (
    <div className="group flex items-center gap-1 rounded-xl hover:bg-surface">
      <Link href={href} className="min-w-0 flex-1 px-3 py-2">
        <div className="truncate font-semibold">{song.title}</div>
        <div className="truncate text-sm text-muted">{subtitle ?? (song.composer ? formatComposer(song.composer) : "")}</div>
      </Link>
      <MenuButton label={`Options for ${song.title}`} onClick={onMenu} />
    </div>
  );
}

export function FolderRow({ name, count, href, onMenu }: { name: string; count: number; href: string; onMenu?: (e: React.MouseEvent) => void }) {
  return (
    <div className="group flex items-center gap-2 rounded-xl bg-surface pr-2 transition-colors hover:bg-surface-hover">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
        <span className="text-sm tabular-nums text-muted">{count}</span>
      </Link>
      {onMenu && <MenuButton label={`Options for ${name}`} onClick={onMenu} alwaysVisible />}
    </div>
  );
}

export function tuneSummary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [keys.join(", ") || null, tempos.length ? `${tempos.join(", ")} BPM` : null, tune.timeSignature].filter(Boolean).join(" · ");
}

export function TuneRow({ tune, href, onMenu }: { tune: Tune; href: string; onMenu: (e: React.MouseEvent) => void }) {
  return (
    <div className="group flex items-center gap-1 rounded-xl hover:bg-surface">
      <Link href={href} className="min-w-0 flex-1 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{tune.name}</span>
          {tune.chordChartId && <ChordChartIcon className="h-4 w-4 shrink-0 text-accent" />}
        </div>
        <div className="truncate text-sm text-muted">{tuneSummary(tune)}</div>
      </Link>
      <MenuButton label={`Options for ${tune.name}`} onClick={onMenu} />
    </div>
  );
}

/** Small recently-opened cards, in a horizontally scrolling row. */
export function RecentCards({ items }: { items: { key: string; title: string; detail: string; href: string; icon: React.ComponentType<{ className?: string }> }[] }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className="flex h-24 w-40 shrink-0 flex-col justify-between rounded-2xl bg-surface p-3 transition-colors hover:bg-surface-hover">
          <it.icon className="h-5 w-5 text-accent" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{it.title}</div>
            <div className="truncate text-xs text-muted">{it.detail}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function menuPosition(e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: rect.right - 200, y: rect.bottom + 4 };
}
