// Moved to packages/core (the Expo migration's shared-logic package) because profileTunes.ts
// (also moved there) needs it, and it's a natural, dependency-free shared type to keep alongside
// it. Re-exported here so every existing in-app `./types` import keeps working unchanged.
export * from "@jam-practice/core/types";
