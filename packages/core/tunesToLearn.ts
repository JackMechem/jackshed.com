/** The fixed `syncedSettings` key an account's own "Tunes to Learn" list — a separate, personal
    list of tunes bookmarked from other people's public profiles, distinct from the owner's own
    Jam Practice tune list (`"tunes"`) — is stored under. `lib/useTunesToLearn.ts` reads/writes it
    client-side; `convex/profiles.ts`'s `getPublicByUsername` also reads it server-side to show a
    "Tunes to Learn" section on a public profile. Lives in its own dependency-free file (not
    `useTunesToLearn.ts` itself, which imports React/Convex client hooks that can't be pulled into
    Convex server code) so both sides can import the same string instead of duplicating it. */
export const TUNES_TO_LEARN_KEY = "jam-practice-tunes-to-learn";
