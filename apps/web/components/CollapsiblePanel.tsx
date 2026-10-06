"use client";

import { HelpIcon } from "@/components/tools";
import { HintsContext } from "@/lib/hints";
import { PANEL_DEFAULTS, panelKey } from "@/lib/panels";
import { usePersistedSettings } from "@/lib/usePersistedSettings";

/** A titled settings card whose body can be folded away. The open state is remembered. */
export default function CollapsiblePanel({
  id,
  title,
  icon: Icon,
  action,
  toggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra control shown at the right of the header (stays visible when collapsed). */
  action?: React.ReactNode;
  /**
   * A switch shown next to the chevron that gates the whole section: while off, there's
   * nothing to expand, so the chevron is hidden and the body stays collapsed.
   */
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  children: React.ReactNode;
}) {
  const [{ open: storedOpen, showHints }, update] = usePersistedSettings(
    panelKey(id),
    PANEL_DEFAULTS,
  );
  const canExpand = !toggle || toggle.checked;
  const open = canExpand && storedOpen;
  const bodyId = `panel-${id}`;

  return (
    <section className="w-full rounded-2xl bg-surface text-left">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => canExpand && update({ open: !storedOpen })}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent sm:px-6"
        >
          <Icon className="h-4 w-4 shrink-0" />
          {title}
        </button>
        <button
          type="button"
          aria-pressed={showHints}
          aria-label={showHints ? "Hide option descriptions" : "Show option descriptions"}
          title={showHints ? "Hide option descriptions" : "Show option descriptions"}
          onClick={() => update({ showHints: !showHints })}
          className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
            showHints
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:bg-background hover:text-foreground"
          }`}
        >
          <HelpIcon className="h-4 w-4" />
        </button>
        {toggle && (
          <button
            type="button"
            role="switch"
            aria-checked={toggle.checked}
            aria-label={title}
            onClick={() => toggle.onChange(!toggle.checked)}
            disabled={toggle.disabled}
            className={`relative mr-1 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              toggle.checked ? "bg-accent" : "bg-background"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-foreground transition-transform ${
                toggle.checked ? "translate-x-4" : ""
              }`}
            />
          </button>
        )}
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        {/*
          Always rendered (never added/removed), so a persisted `toggle.checked` that differs
          between the server default and the saved client value can't cause a hydration
          mismatch. It's just hidden with CSS when there's nothing to expand.
        */}
        <button
          type="button"
          onClick={() => canExpand && update({ open: !storedOpen })}
          tabIndex={-1}
          aria-hidden
          className={`flex h-10 shrink-0 items-center justify-center text-muted hover:text-foreground sm:mr-3 ${
            canExpand ? "w-10" : "w-0 invisible"
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </div>
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
            <HintsContext.Provider value={showHints}>{children}</HintsContext.Provider>
          </div>
        </div>
      </div>
    </section>
  );
}
