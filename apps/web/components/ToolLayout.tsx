"use client";

import { createContext, useContext } from "react";
import { EyeIcon, EyeOffIcon, NAV_LINKS } from "@/components/tools";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";
import { useSidePanelHidden } from "@/lib/panels";

const LayoutContext = createContext<"split" | "stacked">("split");

/** Which layout the surrounding tool page uses, so controls can pick matching icons. */
export function useToolLayout() {
  return useContext(LayoutContext);
}

/** The eye button that brings back a hidden column, labeled so it's clear which one it is. */
function ShowPanelButton({
  label,
  align,
  onClick,
}: {
  label: string;
  align: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${label.toLowerCase()}`}
      title={`Show ${label.toLowerCase()}`}
      className={`flex items-center gap-1.5 self-start rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-muted outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent xl:absolute xl:-top-10 xl:self-auto ${
        align === "left" ? "xl:left-0" : "xl:right-0"
      }`}
    >
      <EyeIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * Shared page shell for the tools: the main display, with the tool's options as a row of setting
 * chips underneath (each panel/section becomes a chip that opens a popover; see `OptionChips`).
 * `layout="stacked"` gives the main display the full width (Slow Downer, Recorder, ...). An
 * optional `sidePanel` (history, logs) still gets its own hideable column on wide screens.
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
  sidePanelLabel,
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
  /** An extra panel on the right (split layout only), styled like the options column. */
  sidePanel?: React.ReactNode;
  /** What to call the side panel on its show/hide buttons (e.g. "History"). */
  sidePanelLabel?: string;
  /** Small, unobtrusive text pinned to the bottom-right corner of the page (e.g. an idea credit). */
  credit?: React.ReactNode;
  /** A mode selector shown above the option chips (e.g. Timed / Listen), for a choice that
      decides which chips there are. */
  optionsMode?: React.ReactNode;
  options: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidePanelHidden, setSidePanelHidden] = useSidePanelHidden();
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
              {children}
            </section>
            {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
          </main>
        ) : (
          <main
            className={`mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16 xl:flex-row xl:gap-10 ${
              sidePanel ? "xl:max-w-6xl" : "xl:max-w-5xl"
            }`}
          >
            <section className="flex w-full min-w-0 flex-col items-center gap-7 text-center xl:flex-1 xl:items-center xl:justify-center">
              <div className="relative flex w-full flex-col items-center gap-7 xl:max-w-[24rem]">
                {sidePanel && sidePanelHidden && (
                  <ShowPanelButton
                    label={sidePanelLabel ?? "Panel"}
                    align="right"
                    onClick={() => setSidePanelHidden(false)}
                  />
                )}
                {children}
                {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
              </div>
            </section>
            {sidePanel && !sidePanelHidden && (
              <aside className="flex w-full flex-col gap-2 xl:w-72 xl:shrink-0">
                <button
                  type="button"
                  onClick={() => setSidePanelHidden(true)}
                  aria-label={`Hide ${(sidePanelLabel ?? "panel").toLowerCase()}`}
                  title={`Hide ${(sidePanelLabel ?? "panel").toLowerCase()}`}
                  className="flex h-8 w-8 items-center justify-center self-end rounded-lg text-muted outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <EyeOffIcon className="h-4 w-4" />
                </button>
                {sidePanel}
              </aside>
            )}
          </main>
        )}
      </div>
    </LayoutContext.Provider>
  );
}

/** A tool's options, as a row of setting chips under its main display (each `CollapsiblePanel` /
    `OptionSection` becomes a chip that opens a popover). Replaces the old hideable options column. */
function OptionChips({ children, mode }: { children: React.ReactNode; mode?: React.ReactNode }) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex w-full flex-col items-center gap-3 pt-2">
        {mode}
        <SettingsBar>{children}</SettingsBar>
      </div>
    </ChipsModeContext.Provider>
  );
}
