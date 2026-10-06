import { Doc, Id } from "./_generated/dataModel";
import { ActionCtx, MutationCtx, action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  createAccount,
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { generateOtp, hashCode, sendEmail } from "./lib/resend";

const CONFIRMATION_CODE_TTL_MS = 15 * 60 * 1000;

/** Which auth providers are linked to the signed-in account — `["password"]`, `["google"]`, or
    both. Drives the account page: whether to show "Change password" vs "Set a password", whether
    "Connect"/"Disconnect Google" is offered, and which delete-account flow applies (a password
    means an emailed confirmation code is required; Google-only doesn't need one — see
    `deleteAccount` vs `requestDeleteConfirmation`/`confirmDelete`). */
export const linkedProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    return accounts.map((a) => a.provider);
  },
});

/** Deletes one authAccounts row and its authVerificationCodes — the common step between deleting
    every provider on an account (performDelete) and disconnecting just one (performProviderDelete). */
async function deleteAuthAccountAndCodes(ctx: MutationCtx, account: Doc<"authAccounts">) {
  const codes = await ctx.db
    .query("authVerificationCodes")
    .withIndex("accountId", (q) => q.eq("accountId", account._id))
    .collect();
  for (const code of codes) await ctx.db.delete(code._id);
  await ctx.db.delete(account._id);
}

// --- Email-gated confirmations (delete account, change/set password) ---------------------------
//
// Both flows share the same shape: a "request" action verifies whatever can be verified up front
// (the current password, if there is one), stores a hashed one-time code in `pendingConfirmations`
// (replacing any earlier pending one for that same kind), and emails it — then a "confirm" action
// takes the code, checks it against that stored hash, and only then performs the actual sensitive
// change. This is deliberately separate from Convex Auth's own sign-up email verification
// (`ResendOTP.ts`, wired into the `Password` provider itself) — these are app-specific
// confirmations for actions taken *after* you're already signed in, not part of authenticating.

export const storeConfirmation = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("deleteAccount"), v.literal("password")),
    codeHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { userId, kind, codeHash, expiresAt }) => {
    const existing = await ctx.db
      .query("pendingConfirmations")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("pendingConfirmations", { userId, kind, codeHash, expiresAt });
  },
});

/** Checks a submitted code against the stored hash (throwing a plain, honest error either way —
    wrong code and expired code look the same to the caller, which is the usual practice for this
    kind of check) and consumes it (deletes the row) so it can't be reused. */
export const consumeConfirmation = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("deleteAccount"), v.literal("password")),
    codeHash: v.string(),
  },
  handler: async (ctx, { userId, kind, codeHash }) => {
    const row = await ctx.db
      .query("pendingConfirmations")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .unique();
    if (!row || row.expiresAt < Date.now() || row.codeHash !== codeHash) {
      throw new Error("That code is invalid or has expired — request a new one.");
    }
    await ctx.db.delete(row._id);
  },
});

/** Generates, stores and emails a fresh confirmation code for `kind` — the shared second half of
    both `requestDeleteConfirmation` and `requestPasswordConfirmation`, after each has done its
    own kind-specific verification (or decided none was needed). */
async function sendConfirmationCode(
  ctx: ActionCtx,
  userId: Id<"users">,
  kind: "deleteAccount" | "password",
  email: string,
) {
  const code = generateOtp();
  await ctx.runMutation(internal.account.storeConfirmation, {
    userId,
    kind,
    codeHash: await hashCode(code),
    expiresAt: Date.now() + CONFIRMATION_CODE_TTL_MS,
  });
  const subject =
    kind === "deleteAccount"
      ? "Confirm deleting your sheddex account"
      : "Confirm your sheddex password change";
  const action =
    kind === "deleteAccount"
      ? "permanently delete your account"
      : "finish changing your password";
  const ignoreNote =
    kind === "deleteAccount"
      ? "your account will stay exactly as it is"
      : "your password won't change";
  await sendEmail({
    to: email,
    subject,
    text: `Your confirmation code is ${code}\n\nEnter it on the account page to ${action}. It expires in 15 minutes. If you didn't request this, you can ignore this email — ${ignoreNote}.`,
  });
}

/** Step 1 of deleting an account that has a password: verifies the password (same as the old
    direct-delete flow did), then emails a confirmation code instead of deleting right away. Not
    used for Google-only accounts — see `deleteAccount` below for that exception. */
export const requestDeleteConfirmation = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const providers = await ctx.runQuery(api.account.linkedProviders);
    if (!providers.includes("password")) {
      throw new Error("This account doesn't have a password — delete it directly instead.");
    }
    const user = await ctx.runQuery(api.users.current);
    if (!user?.email) throw new Error("This account doesn't have an email on file.");
    await retrieveAccount(ctx, {
      provider: "password",
      account: { id: user.email, secret: password },
    });
    await sendConfirmationCode(ctx, userId, "deleteAccount", user.email);
  },
});

/** Step 2: the code from `requestDeleteConfirmation`'s email actually deletes the account. */
export const confirmDelete = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    await ctx.runMutation(internal.account.consumeConfirmation, {
      userId,
      kind: "deleteAccount",
      codeHash: await hashCode(code),
    });
    await ctx.runMutation(internal.account.performDelete, { userId });
  },
});

/** Deletes the signed-in user's account immediately, with no emailed confirmation — the
    deliberate exception for accounts that only have Google (no password): there's no password to
    verify up front the way `requestDeleteConfirmation` does, and the UI's own "type DELETE to
    confirm" step is considered sufficient friction on its own for that case. Refuses outright for
    an account that *does* have a password, so this can't be used to route around the email
    confirmation those accounts require. */
export const deleteAccount = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const providers = await ctx.runQuery(api.account.linkedProviders);
    if (providers.includes("password")) {
      throw new Error(
        "This account has a password, so deleting it needs an emailed confirmation code.",
      );
    }
    await ctx.runMutation(internal.account.performDelete, { userId });
  },
});

export const performDelete = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) await deleteAuthAccountAndCodes(ctx, account);

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    // Public-facing data specifically must not outlive the account it belongs to — unlike the
    // private synced tool data (tunes, trainer stats, ...) this doesn't touch, a public profile
    // staying live and searchable after "deleting your account" would directly contradict what
    // the account page and Privacy Policy both promise. Deletes the profile row itself, its
    // uploaded avatar file (if any — otherwise it'd just sit in storage forever, unreferenced),
    // and every follow relationship in both directions (so nobody's Following/Followers list
    // keeps showing a ghost entry for a user that no longer exists).
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      if (profile.avatarStorageId) await ctx.storage.delete(profile.avatarStorageId);
      await ctx.db.delete(profile._id);
    }
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", userId))
      .collect();
    for (const row of following) await ctx.db.delete(row._id);
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", userId))
      .collect();
    for (const row of followers) await ctx.db.delete(row._id);

    // Same reasoning: a Community chord-chart or tune-list post is public-facing content, not
    // private synced tool data, so neither should outlive the account that posted it. Each
    // chord-chart post's own songs (`communityChordChartSongs`) are deleted first — they're a
    // separate table now (one row per song, not inline on the post — see that table's own
    // comment), so they'd otherwise be left behind as orphans once the post row itself is gone.
    const chartPosts = await ctx.db
      .query("communityChordCharts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of chartPosts) {
      const songs = await ctx.db
        .query("communityChordChartSongs")
        .withIndex("by_post", (q) => q.eq("postId", row._id))
        .collect();
      for (const song of songs) await ctx.db.delete(song._id);
      await ctx.db.delete(row._id);
    }
    const tunePosts = await ctx.db
      .query("communityTunes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of tunePosts) await ctx.db.delete(row._id);

    await ctx.db.delete(userId);
  },
});

/** Step 1 of changing (or, for a Google-only account, setting for the first time) a password:
    verifies the *current* password if one exists — nothing to verify yet if this is a first-time
    "set a password" — then emails a confirmation code. Deliberately doesn't take `newPassword` at
    all: it's kept client-side only (in memory) between this request and `confirmPassword`, so a
    password never sits in the database while a confirmation is pending. */
export const requestPasswordConfirmation = action({
  args: { currentPassword: v.optional(v.string()) },
  handler: async (ctx, { currentPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const providers = await ctx.runQuery(api.account.linkedProviders);
    const user = await ctx.runQuery(api.users.current);
    if (!user?.email) throw new Error("Your account needs an email on file first.");
    if (providers.includes("password")) {
      if (!currentPassword) throw new Error("Enter your current password.");
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: user.email, secret: currentPassword },
      });
    }
    await sendConfirmationCode(ctx, userId, "password", user.email);
  },
});

/** Step 2: the code from `requestPasswordConfirmation`'s email, plus the new password (still only
    ever held client-side until now), actually applies it. Re-checks `linkedProviders` itself
    (rather than trusting which step 1 path the client took) to decide between changing an
    existing password (`modifyAccountCredentials`, then signing out every other session — a
    leaked old password shouldn't still work elsewhere) and setting a first one (`createAccount`
    with `shouldLinkViaEmail: true`, linking to *this* already-signed-in, already-verified-email
    user rather than accidentally creating a second one — same defensive `linkedUser._id !==
    userId` check as before). */
export const confirmPassword = action({
  args: { code: v.string(), newPassword: v.string() },
  handler: async (ctx, { code, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    await ctx.runMutation(internal.account.consumeConfirmation, {
      userId,
      kind: "password",
      codeHash: await hashCode(code),
    });
    const providers = await ctx.runQuery(api.account.linkedProviders);
    const user = await ctx.runQuery(api.users.current);
    if (!user?.email) throw new Error("Your account needs an email on file first.");
    if (providers.includes("password")) {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: user.email, secret: newPassword },
      });
      const sessionId = await getAuthSessionId(ctx);
      await invalidateSessions(ctx, { userId, except: sessionId ? [sessionId] : [] });
    } else {
      const { user: linkedUser } = await createAccount(ctx, {
        provider: "password",
        account: { id: user.email, secret: newPassword },
        profile: { email: user.email },
        shouldLinkViaEmail: true,
      });
      if (linkedUser._id !== userId) {
        throw new Error(
          "Something went wrong setting your password — please try again, or contact support before retrying.",
        );
      }
    }
  },
});

/** Disconnects Google from the signed-in account — only when a password is already set (so
    there's still a way to sign back in afterward). The account page itself is expected to check
    this before offering the button, but it's re-checked here too since the action is the real
    source of truth, not the UI. */
export const disconnectGoogle = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const providers = await ctx.runQuery(api.account.linkedProviders);
    if (!providers.includes("google")) throw new Error("Google isn't connected.");
    if (!providers.includes("password")) {
      throw new Error("Set a password first, so you don't lose access to your account.");
    }
    await ctx.runMutation(internal.account.performProviderDelete, { userId, provider: "google" });
  },
});

export const performProviderDelete = internalMutation({
  args: { userId: v.id("users"), provider: v.string() },
  handler: async (ctx, { userId, provider }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", provider))
      .unique();
    if (account) await deleteAuthAccountAndCodes(ctx, account);
  },
});
