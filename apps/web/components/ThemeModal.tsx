"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Select from "@/components/Select";
import ThemeSearchModal from "@/components/ThemeSearchModal";
import { SearchIcon } from "@/components/tools";
import {
  getServerThemeState,
  getThemeState,
  resolveColors,
  selectCustom,
  setCustomColor,
  setCustomColors,
  setFont,
  setPreset,
  subscribeTheme,
} from "@/lib/theme";
import { FONTS } from "@/lib/fonts";
import {
  ALL_PRESETS,
  CUSTOM_THEME_ID,
  PRESETS,
  THEME_FIELDS,
  ThemeColorKey,
  ThemeColors,
  getPreset,
  isValidHex,
} from "@/lib/themes";

export function Swatch({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="flex h-14 w-full flex-col justify-between rounded-lg p-2 ring-1 ring-black/10"
      style={{ background: colors.background }}
    >
      <div className="h-3 w-2/3 rounded" style={{ background: colors.surface }} />
      <div className="flex items-center gap-1">
        <div className="h-3 w-6 rounded-full" style={{ background: colors.accent }} />
        <div className="h-3 w-3 rounded-full" style={{ background: colors.foreground }} />
        <div className="h-3 w-3 rounded-full" style={{ background: colors.muted }} />
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (isValidHex(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setDraft(null)}
          spellCheck={false}
          aria-label={`${label} hex value`}
          className={`w-24 rounded-lg bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-accent ${
            isValidHex(shown) ? "" : "text-danger"
          }`}
        />
        <input
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
          aria-label={label}
          className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
      </div>
    </div>
  );
}

export default function ThemeModal({ onClose }: { onClose: () => void }) {
  const state = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);
  const isCustom = state.id === CUSTOM_THEME_ID;
  const colors = resolveColors(state);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Theme"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold">Theme</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover sm:h-8 sm:w-8"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PRESETS.map((preset) => {
              const selected = state.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPreset(preset.id)}
                  aria-pressed={selected}
                  className={`flex flex-col gap-2 rounded-xl bg-background p-2 text-left text-sm font-medium transition-shadow ${
                    selected ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-surface-hover"
                  }`}
                >
                  <Swatch colors={preset.colors} />
                  <span className="px-1">{preset.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={selectCustom}
              aria-pressed={isCustom}
              className={`flex flex-col gap-2 rounded-xl bg-background p-2 text-left text-sm font-medium transition-shadow ${
                isCustom ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-surface-hover"
              }`}
            >
              <Swatch colors={state.custom ?? colors} />
              <span className="px-1">Custom</span>
            </button>
            {/* Not a preset itself — opens `ThemeSearchModal`, a `/`-search-style overlay over the
                rest of `ALL_PRESETS` (this grid's own small set plus a much longer tail modeled on
                terminal/editor color schemes), so this grid can stay the same quick, uncluttered
                pick list it's always been. */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex flex-col gap-2 rounded-xl bg-background p-2 text-left text-sm font-medium transition-shadow hover:ring-2 hover:ring-surface-hover"
            >
              <div className="flex h-14 w-full items-center justify-center gap-1.5 rounded-lg text-muted ring-1 ring-black/10">
                <SearchIcon className="h-4 w-4" />
                <span className="text-xs">{ALL_PRESETS.length} themes</span>
              </div>
              <span className="px-1">See all</span>
            </button>
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">Font</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FONTS.map((font) => {
                const selected = state.font === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setFont(font.id)}
                    aria-pressed={selected}
                    className={`flex flex-col gap-1 rounded-xl bg-background p-3 text-left transition-shadow ${
                      selected ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-surface-hover"
                    }`}
                  >
                    <span className="text-2xl leading-none" style={{ fontFamily: font.stack }}>
                      Aa 123
                    </span>
                    <span className="truncate text-sm font-medium">{font.label}</span>
                    <span className="text-xs text-muted">{font.kind}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {isCustom && (
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                  Custom colors
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Start from</span>
                  <Select
                    value=""
                    onChange={(id) => {
                      const preset = getPreset(id);
                      if (preset) setCustomColors(preset.colors);
                    }}
                    options={[
                      { value: "", label: "Preset…" },
                      ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
                    ]}
                    className="min-w-32"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {THEME_FIELDS.map(({ key, label }) => (
                  <ColorRow
                    key={key}
                    label={label}
                    value={colors[key]}
                    onChange={(value) => setCustomColor(key as ThemeColorKey, value)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        {/* A child of this inner panel (which already stops click propagation), not a sibling of
            it — `ThemeSearchModal` portals to `document.body`, and React bubbles portal events
            through the *React* tree regardless of where they land in the DOM, so nesting it here
            is what keeps a click inside it from bubbling up to the outer backdrop's own
            `onClick={onClose}` and closing this whole modal underneath it. */}
        {searchOpen && <ThemeSearchModal onClose={() => setSearchOpen(false)} />}
      </div>
    </div>
  );
}
