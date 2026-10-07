/** Small bits shared by the drill-style trainers (Note Trainer, Scale Trainer). */

/** e.g. 1234ms -> "1:14.7" (a tenth of a second is precise enough for a practice drill). */
export function formatDuration(ms: number): string {
  const tenths = Math.round(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** Fisher-Yates, for handing out a drill-mode queue in a random order. */
export function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
