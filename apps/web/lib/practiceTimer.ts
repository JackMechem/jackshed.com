// Moved to packages/core (the Expo migration's shared-logic package) because
// convex/practiceSessions.ts needs it too, and Convex functions can't reach into this app's own
// lib/ directory across the apps/web <-> packages/convex workspace boundary. Re-exported here so
// every existing in-app `./practiceTimer` import keeps working unchanged.
export * from "@jam-practice/core/practiceTimer";
