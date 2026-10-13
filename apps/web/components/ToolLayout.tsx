"use client";

import { createContext, useContext } from "react";
import { NAV_LINKS } from "@/components/tools";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";

const LayoutContext = createContext<"split" | "stacked">("split");

/** Which layout the surrounding tool page uses, so controls can pick matching icons. */
export function useToolLayout() {
  return useContext(LayoutContext);
}

/**
 * Shared page shell for the tools: the main display, with the tool's options as a row of setting
 * chips underneath (each panel/section becomes a chip that opens a popover; see `OptionChips`).
 * `layout="stacked"` gives the main display the full width (Slow Downer, Recorder, ...). An
 * optional `sidePanel` (history, struggles, logs) gets its own chips just above the main display.
 */
export default function ToolLayout({
  title,
  options,
  optionsMode,
  layout = "split",
  topAligned = false,
  titleExtra,
  help,
  sidePanel,
  credit,
  children,
}: {
  title: string;
  layout?: "split" | "stacked";
  /** With the stacked layout: pin content to the top and let it fill the height (no centring). */
  topAligned?: boolean;
  /** Shown to the right of the title in the page header (e.g. the current project). */
  titleExtra?: React.ReactNode;
  /** A help button shown right after the title. */
  help?: React.ReactNode;
  /** Extra panels (history, logs), shown as chips just above the main display. */
  sidePanel?: React.ReactNode;
  /** Small, unobtrusive text pinned to the bottom-right corner of the page (e.g. an idea credit). */
  credit?: React.ReactNode;
  /** A mode selector shown above the option chips (e.g. Timed / Listen), for a choice that
      decides which chips there are. */
  optionsMode?: React.ReactNode;
  options: React.ReactNode;
  children: React.ReactNode;
}) {
  const stacked = layout === "stacked";
  const TitleIcon = NAV_LINKS.find((link) => link.label === title)?.icon;

  return (
    <LayoutContext.Provider value={layout}>
      <div className="relative flex min-h-full flex-1 flex-col bg-background text-foreground">
        <div className="absolute left-0 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 items-center pl-16 sm:pl-[4.5rem] lg:top-2 lg:pl-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-accent">
            {TitleIcon && <TitleIcon className="h-7 w-7 shrink-0" />}
            {title}
          </h1>
          {help && <div className="ml-3">{help}</div>}
          {titleExtra && <div className="ml-4 pr-4">{titleExtra}</div>}
        </div>

        {credit && (
          <p className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] z-10 text-xs text-muted/70">
            {credit}
          </p>
        )}

        {stacked ? (
          <main className="flex w-full flex-1 flex-col gap-6 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
            <section
              className={`flex w-full min-w-0 flex-1 flex-col items-center gap-6 text-center ${
                topAligned ? "justify-start" : "justify-center"
              }`}
            >
              {sidePanel && <TopChips>{sidePanel}</TopChips>}
              {children}
            </section>
            {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
          </main>
        ) : (
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16 xl:max-w-5xl">
            <section className="flex w-full min-w-0 flex-col items-center gap-7 text-center xl:items-center xl:justify-center">
              <div className="relative flex w-full flex-col items-center gap-7 xl:max-w-[24rem]">
                {sidePanel && <TopChips>{sidePanel}</TopChips>}
                {children}
                {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
              </div>
            </section>
          </main>
        )}
      </div>
    </LayoutContext.Provider>
  );
}

/** A tool's options, as a row of setting chips under its main display (each `CollapsiblePanel` /
    `OptionSection` becomes a chip that opens a popover). Replaces the old hideable options column. */
function OptionChips({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode?: React.ReactNode;
}) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex w-full flex-col items-center gap-3 pt-2">
        {mode}
        <SettingsBar>{children}</SettingsBar>
      </div>
    </ChipsModeContext.Provider>
  );
}

/** The side panels (history, struggles, logs) as a small row of chips above the main display. */
function TopChips({ children }: { children: React.ReactNode }) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </ChipsModeContext.Provider>
  );
}
