"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, SlidersIcon } from "@/components/tools";

/** Set by `ToolLayout` around a tool's `options`: when true, `CollapsiblePanel`, `OptionsCard` and
    `OptionSection` render as setting chips (below) instead of panels, which is how every tool's
    options are shown. */
export const ChipsModeContext = createContext(false);
export const useChipsMode = () => useContext(ChipsModeContext);

/** True when a click/keypress belongs to a floating menu or listbox (a `Select`'s options, a
    `Flyout`/`ContextMenu`), which are portaled outside the popover but belong to it. */
function inFloatingMenu(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[role="listbox"], [role="menu"]');
}

/** A row of setting chips. Each chip shows the setting's current value and opens a popover (a
    bottom sheet on phones) to change it, so there's no options column to expand, collapse or
    hide. One popover is open at a time. */
export function SettingsBar({ children, fit = false }: { children: ReactNode; /** Wrap within the container instead of growing past it (inside a card). */ fit?: boolean }) {
  return (
    <div
      className={`flex w-full flex-wrap items-stretch justify-center gap-2 ${
        fit ? "" : "sm:w-max sm:max-w-[min(46rem,calc(100vw-2rem))] sm:shrink-0"
      }`}
    >
      {children}
    </div>
  );
}

const GAP = 8; // between the chip and its popover
const MARGIN = 16; // kept clear at the screen's edges
const SM = 640; // Tailwind's `sm` breakpoint: below it the popover is a bottom sheet

type Placement = { style: CSSProperties };

/** Where the popover goes on a wider screen: always just above its chip, centred on it but kept
    on screen, and never taller than the space above the chip. It's `position: fixed`, so a long
    popover scrolls inside itself instead of making the page scroll. */
function place(chip: HTMLElement, width: number): Placement | null {
  if (window.innerWidth < SM) return null;
  const r = chip.getBoundingClientRect();
  const w = Math.min(width, window.innerWidth - 2 * MARGIN);
  const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN);
  return {
    style: {
      position: "fixed",
      left,
      width: w,
      bottom: window.innerHeight - r.top + GAP,
      maxHeight: r.top - GAP - MARGIN,
    },
  };
}

export function SettingChip({
  icon: Icon,
  label,
  value,
  title,
  wide,
  headerExtra,
  toggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** A setting that can be switched on and off as a whole: the chip becomes a split chip, a
      switch (with the label and value) that toggles it straight away, and a separate settings
      button that opens the popover. Dimmed while off. */
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  /** Small caption above the value, e.g. "Time" — or, with no `value`, the chip's only text. */
  label: string;
  /** The current value, e.g. "7/8". */
  value?: ReactNode;
  /** Extra controls in the popover's header, before the close button (e.g. a "?" toggle). */
  headerExtra?: ReactNode;
  /** The popover's heading (defaults to `label`). */
  title?: string;
  /** A wider popover, for bigger editors. */
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const width = wide ? 480 : 384;

  // Position it before paint, and follow the chip if the window resizes or the page scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => chipRef.current && setPlacement(place(chipRef.current, width));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (inFloatingMenu(e.target)) return;
      if (!chipRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // A dropdown open inside the popover closes first.
      if (e.key === "Escape" && !document.querySelector('[role="listbox"], [role="menu"]')) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sheet = !placement; // phones

  const labelAndValue = (inverted: boolean) =>
    value === undefined || value === null || value === "" ? (
      <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
    ) : (
      <span className="min-w-0">
        <span className={`block text-[11px] font-medium leading-tight ${inverted ? "opacity-80" : "text-muted"}`}>{label}</span>
        <span className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold leading-tight">{value}</span>
      </span>
    );

  const chip = toggle ? (
    <div
      ref={chipRef}
      className={`flex items-stretch overflow-hidden rounded-2xl bg-surface transition ${open ? "ring-2 ring-accent" : ""} ${toggle.checked ? "" : "opacity-70"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={toggle.checked}
        aria-label={label}
        disabled={toggle.disabled}
        onClick={() => toggle.onChange(!toggle.checked)}
        className="flex items-center gap-3 py-2 pl-3 pr-3 text-left transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${toggle.checked ? "bg-accent" : "bg-background"}`}>
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground shadow transition-transform ${toggle.checked ? "translate-x-4" : ""}`} />
        </span>
        {labelAndValue(false)}
      </button>
      <span className="my-2 w-px bg-foreground/10" aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} settings`}
        title={`${label} settings`}
        className={`flex items-center px-3 transition ${open ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
      >
        <SlidersIcon className="h-4 w-4" />
      </button>
    </div>
  ) : null;

  return (
    <>
      {chip ?? (
      <div ref={chipRef} className="flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-3 rounded-2xl py-2 pl-3 pr-4 text-left transition active:scale-[0.98] ${
          open ? "bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-hover"
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${open ? "bg-accent-foreground/15" : "bg-accent/15 text-accent"}`}>
          <Icon className="h-4 w-4" />
        </span>
        {labelAndValue(open)}
      </button>
      </div>
      )}

      {open &&
        createPortal(
          <>
            {sheet && <div className="fixed inset-0 z-40 bg-overlay" aria-hidden onClick={() => setOpen(false)} />}
            <div
              ref={popRef}
              role="dialog"
              aria-label={title ?? label}
              style={placement?.style}
              className={`settings-pop z-50 flex flex-col overflow-hidden rounded-3xl bg-surface text-left text-foreground shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)] ring-1 ring-foreground/[0.06] ${
                sheet ? "fixed inset-x-3 bottom-3 max-h-[80dvh]" : "origin-bottom"
              }`}
            >
              <div className="flex shrink-0 items-center gap-1 px-5 pb-2 pt-4">
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title ?? label}</h2>
                {headerExtra}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Only this part scrolls, inside the popover. */}
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 [scrollbar-width:thin]">{children}</div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
