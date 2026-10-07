/** Username rules for public profiles (`convex/profiles.ts`) — deliberately unrelated to how you
    sign in (email/password or Google); this is a separate, opt-in identity only shown if/when a
    profile is made public. Lowercase-only by construction (both storage and display use the same
    normalized form), so there's never a "@JohnSmith" vs. "@johnsmith" ambiguity to reason about —
    one canonical form, checked here and reused identically client-side (instant feedback while
    typing) and server-side (`upsertProfile`'s own source-of-truth check — client validation is
    never trusted alone). */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

/** Lowercases and trims — the one canonical form a username is ever stored, compared, or shown
    in. Doesn't validate; call `usernameError` for that. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** `null` means valid. Otherwise a short, user-facing reason — shown directly in the editor, so
    kept plain and specific rather than a generic "invalid username". */
export function usernameError(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length === 0) return "Enter a username.";
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Must be ${USERNAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Only lowercase letters, numbers, underscores, and hyphens.";
  }
  return null;
}
