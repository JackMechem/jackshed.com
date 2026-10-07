/** Ported verbatim from `apps/web/lib/meters.ts`. `SIGNATURE_PRESETS` isn't used by the web
    Metronome tool's own UI anymore (removed per a direct "get rid of the presets" request there),
    kept here only because `parseMeter`/the two constants are still genuinely shared. */
export const MAX_BEATS = 64;
export const MAX_BEAT_UNIT = 64;

export const SIGNATURE_PRESETS = [
  { beats: 2, unit: 4, groups: [2] },
  { beats: 3, unit: 4, groups: [3] },
  { beats: 4, unit: 4, groups: [4] },
  { beats: 5, unit: 4, groups: [3, 2] },
  { beats: 6, unit: 8, groups: [3, 3] },
  { beats: 7, unit: 8, groups: [2, 2, 3] },
  { beats: 9, unit: 8, groups: [3, 3, 3] },
  { beats: 12, unit: 8, groups: [3, 3, 3, 3] },
];

export function parseMeter(text: string): { beats: number; unit: number } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]);
  return beats >= 1 && beats <= MAX_BEATS && unit >= 1 && unit <= MAX_BEAT_UNIT
    ? { beats, unit }
    : null;
}
