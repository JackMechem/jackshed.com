// Moved to packages/core (the Expo migration's shared-logic package) — apps/mobile needs the exact
// same preset list to "look exactly the same" (per a direct request) as this app does, and the
// whole file was already pure data/math with no DOM dependency, so there was nothing to split.
// Re-exported here so every existing in-app `./themes` / `@/lib/themes` import keeps working
// unchanged.
export * from "@jam-practice/core/themes";
