/** Autocomplete suggestions for a public profile's "instruments played" field
    (`components/AccountPage.tsx`'s Public Profile tab) — the field itself is free text (an array
    of strings, `profiles.instruments` in `convex/schema.ts`), so anything not listed here (e.g.
    "Harmonica", "Banjo") still works fine; this only drives suggestions, it's never validated
    against. Deliberately a fresh, purpose-built list rather than `lib/instruments.ts`'s
    `INSTRUMENTS` — that catalog is for the note-range trainers specifically (range-based entries
    like six separate "Keyboard — N Key" sizes, nothing for Drums or Voice at all), a poor
    semantic fit for "what do you play" on a profile. */
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
