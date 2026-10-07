import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import { PracticeSession, Segment, PomodoroConfig } from "./practiceTimer";
import { getServerSnapshot, getSnapshot, setSessions, subscribe } from "./practiceSessionsStore";

export type SessionInput =
  | { name: string; type: "custom"; segments: Segment[] }
  | { name: string; type: "pomodoro"; pomodoro: PomodoroConfig };

/** Saved Practice Timer sessions, switched wholesale between local storage and the signed-in
    account with **no merge**: signed out reads/writes `practiceSessionsStore` (this device only);
    signed in reads/writes Convex only, and whatever happens to already be in local storage on
    that device is simply never looked at — not imported, not offered as a choice. That's Jack's
    explicit call (simpler than even a one-time merge prompt), not a "smarter" sync design left
    out for lack of time.

    Both `useConvexAuth()` and the Convex/local-store hooks below run unconditionally on every
    render regardless of sign-in state, per rules-of-hooks — the `useQuery` call itself is always
    made, but passed Convex's `"skip"` sentinel instead of real args while signed out, so a
    signed-out visitor never opens a live subscription for data they can't have (same pattern used
    throughout this codebase's other signed-in-aware code, e.g. `AccountPage.tsx`). */
export function usePracticeSessions() {
  const { isAuthenticated } = useConvexAuth();
  const convexSessions = useQuery(api.practiceSessions.list, isAuthenticated ? {} : "skip");
  const localSessions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const createMutation = useMutation(api.practiceSessions.create);
  const updateMutation = useMutation(api.practiceSessions.update);
  const removeMutation = useMutation(api.practiceSessions.remove);

  const sessions = isAuthenticated ? (convexSessions ?? []) : localSessions;
  // Convex's useQuery returns undefined until the first result lands — distinct from "signed in,
  // zero saved sessions" ([]). Signed-out local storage has no such loading gap.
  const loading = isAuthenticated && convexSessions === undefined;

  async function createSession(input: SessionInput): Promise<PracticeSession> {
    if (isAuthenticated) {
      const id = await createMutation(input);
      return { id, updatedAt: Date.now(), ...input } as PracticeSession;
    }
    const session = { id: crypto.randomUUID(), updatedAt: Date.now(), ...input } as PracticeSession;
    setSessions((prev) => [...prev, session]);
    return session;
  }

  /** `session.id` must already be a real, previously-saved id (from `createSession` or the
      `sessions` list) — never a fresh client-side draft id that hasn't been created yet. */
  async function updateSession(session: PracticeSession): Promise<void> {
    if (isAuthenticated) {
      const { id, updatedAt: _updatedAt, ...fields } = session;
      void _updatedAt; // server sets its own updatedAt on write, this one's discarded
      await updateMutation({ id: id as Id<"practiceSessions">, ...fields });
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...session, updatedAt: Date.now() } : s)),
    );
  }

  async function deleteSession(id: string): Promise<void> {
    if (isAuthenticated) {
      await removeMutation({ id: id as Id<"practiceSessions"> });
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return { sessions, loading, createSession, updateSession, deleteSession };
}
