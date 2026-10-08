import { KEY_NAMES, keyPitchClass } from "./iRealPro";

/** A key label's root as one of `KEY_NAMES` ("C", "Db", ... "F#", ... "B"). */
export function keyRoot(label: string): string {
  return KEY_NAMES[keyPitchClass(label)];
}

/** Minor? Chart keys write it "E-", tune keys "Em". */
export function isMinorKey(label: string): boolean {
  const rest = label.trim().replace(/^[A-G][b#]?/, "");
  return rest.startsWith("-") || (rest.startsWith("m") && !rest.startsWith("maj"));
}

/** A key label for display: "E-" → "Em", others as-is. */
export function displayKey(label: string): string {
  const t = label.trim();
  return t.endsWith("-") ? `${t.slice(0, -1)}m` : t;
}

/**
 * The key a tune is played in within a setlist: the setlist's own choice for it (`overrideRoot`,
 * just a root — the tune stays major/minor) if any, else its chord chart's key, else the tune's
 * first enabled key. `null` if nothing's known.
 */
export function setlistKey(opts: { overrideRoot?: string | null; chartKey?: string | null; tuneKeys?: string[] }): string | null {
  const base = opts.chartKey || opts.tuneKeys?.[0] || null;
  if (opts.overrideRoot) return `${opts.overrideRoot}${base && isMinorKey(base) ? "m" : ""}`;
  return base ? displayKey(base) : null;
}

/** Semitones to transpose a chart in `fromKey` so it's in `toRoot` (0–11). */
export function semitonesTo(fromKey: string, toRoot: string): number {
  return (KEY_NAMES.indexOf(toRoot) - keyPitchClass(fromKey) + 12) % 12;
}
