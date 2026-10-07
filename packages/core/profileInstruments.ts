/** Autocomplete suggestions for a public profile's "instruments played" field — the field itself
    is free text (an array of strings, `profiles.instruments` in `packages/convex/schema.ts`), so
    anything not listed here (e.g. "Harmonica", "Banjo") still works fine; this only drives
    suggestions, it's never validated against. Deliberately a fresh, purpose-built list rather than
    `lib/instruments.ts`'s `INSTRUMENTS` — that catalog is for the note-range trainers specifically
    (range-based entries like six separate "Keyboard — N Key" sizes, nothing for Drums or Voice at
    all), a poor semantic fit for "what do you play" on a profile. Moved here from
    `apps/web/lib/profileInstruments.ts` (the usual re-export shim sits at that path) the first
    time something outside `apps/web` — the mobile account page's own Public Profile tab — needed
    it too, per this package's own "pull, don't push" rule. */
export const COMMON_INSTRUMENTS = [
  "Piano",
  "Guitar",
  "Bass",
  "Drums",
  "Voice",
  "Saxophone",
  "Trumpet",
  "Trombone",
  "Clarinet",
  "Flute",
  "Violin",
  "Viola",
  "Cello",
  "Ukulele",
  "Banjo",
  "Harmonica",
  "Keyboard",
  "Percussion",
];
