import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  /** A code emailed to confirm a sensitive account action before it actually happens — see
      `convex/account.ts`'s `request*`/`confirm*` action pairs. One row per `(userId, kind)`; a
      fresh request replaces any existing pending one for that same kind (no stacking multiple
      live codes). Stores a SHA-256 hash of the code, not the code itself. */
  pendingConfirmations: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("deleteAccount"), v.literal("password")),
    codeHash: v.string(),
    expiresAt: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),

  /** One saved Practice Timer session per row (mirrors `lib/practiceTimer.ts`'s `PracticeSession`
      union, minus its own `id` — the Convex document id is the id once synced). Signed-in-only:
      when signed out, the exact same shape lives client-side in localStorage instead
      (`lib/practiceSessionsStore.ts`) — see `lib/usePracticeSessions.ts`, which switches between
      the two with no merge, per Jack's call: signing in reads the account's data only, local data
      already on the device is simply not consulted. */
  practiceSessions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: v.union(v.literal("custom"), v.literal("pomodoro")),
    segments: v.optional(
      v.array(v.object({ id: v.string(), title: v.string(), minutes: v.number() })),
    ),
    pomodoro: v.optional(
      v.object({
        workMinutes: v.number(),
        shortBreakMinutes: v.number(),
        longBreakMinutes: v.number(),
        workTitles: v.array(v.string()),
        cyclesBeforeLongBreak: v.number(),
        totalCycles: v.union(v.number(), v.null()),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Generic account-wide sync for every other tool's settings — one row per `(userId, key)`,
      `value` holding that tool's *entire* localStorage-equivalent settings object, JSON-stringified
      whole. Deliberately not a hand-typed table per tool: nearly every tool component already
      round-trips its own settings object through `JSON.stringify`/`JSON.parse` for
      `usePersistedSettings` (`lib/usePersistedSettings.ts`), so it's already guaranteed
      JSON-safe — storing it as one opaque blob here means a new tool, or a new field on an
      existing tool's settings, never needs a matching schema change on this side. `key` is each
      tool's own existing localStorage key string, reused as-is (e.g.
      `"jam-practice-note-trainer"`, `"jam-practice-metronome"`), so there's exactly one obvious
      `key` per synced call site, not a second naming scheme to keep in sync alongside it.
      `lib/useSyncedSettings.ts` is the one hook every synced tool's settings go through — same
      no-merge rule as
      `practiceSessions` above: signed out reads/writes localStorage only (unchanged,
      zero-risk — it's still the exact same `usePersistedSettings` code underneath), signed in
      reads/writes this table only, and whatever's already in localStorage on that device is
      simply never consulted once signed in. Reused as-is (same table, no schema change) for
      `lib/useSyncedTunes.ts` (Jam Practice's tune list — not itself a `usePersistedSettings`
      object, but the exact same "one JSON blob per key" shape fits it too) under the fixed key
      `"tunes"`. */
  syncedSettings: defineTable({
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_user_key", ["userId", "key"]),

  /** A user's public-facing profile — this app's first data that's ever visible to anyone other
      than its own owner. `username` is always lowercased before storing (one field, no separate
      display-case, so "@JohnSmith" and "@johnsmith" can't read as two different things) and has
      nothing to do with how you sign in — a separate identity you opt into. `instruments` is
      deliberately free text, not `lib/instruments.ts`'s `INSTRUMENTS` catalog (that list is
      range-specific for the note trainers — six different "Keyboard — N Key" entries, nothing for
      Drums/Voice — a bad semantic fit for "what do you play"; see `lib/profileInstruments.ts`'s
      `COMMON_INSTRUMENTS` for the autocomplete-only suggestion list). A public profile's tune
      lists (`convex/profiles.ts`'s `getPublicByUsername`) aren't stored here at all — they're
      *every* tune in the owner's own `"tunes"`/`"tunesToLearn"` `syncedSettings` rows, resolved
      live at read time, not a curated subset; see that function's own comment for why there's
      nothing to pick here. None of this is visible to anyone while `isPublic` is false — see
      `convex/profiles.ts` for exactly which queries require that flag.
      `knownTuneIds` is a deprecated, no-longer-written leftover from an earlier design (a curated
      subset of tunes to show, picked by hand) — kept `optional` rather than removed so existing
      rows that still have it don't fail schema validation; new code never reads or writes it. */
  profiles: defineTable({
    userId: v.id("users"),
    username: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    instruments: v.array(v.string()),
    knownTuneIds: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),

  /** One row per follow relationship — `followerId` follows `followingId`. `by_pair` is what
      `convex/follows.ts`'s `follow` mutation checks first to stay idempotent (never inserts a
      second row for the same pair). Both Following and Followers show on a profile
      (`by_follower`/`by_following` respectively), gated the same way the rest of a profile is:
      always visible for your own account, otherwise only if that profile is `isPublic` — a
      private profile's social graph stays private too, not just its tune list. */
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_pair", ["followerId", "followingId"]),

  /** Community's **one and only post type** — a tune, or a whole tune list, posted for any
      signed-in account to browse and import. `tunes` is a snapshot of `PublicTune[]`
      (`lib/profileTunes.ts` — name/tempos/keys/time signature, never `notes`) taken from the
      poster's own Tunes list at post time, not a live reference to it, stored as `v.any()` since
      `PublicTune[]` is already a stable, hand-typed shape and storing it as an opaque blob means a
      future field added to it doesn't also need a schema migration here.
      **A chord chart can only ever be posted by being attached to a tune** — each `PublicTune` in
      `tunes` may carry its own `linkedChart` (a fully-resolved snapshot, set at post time by
      `convex/communityTunes.ts`'s `create` via `resolveLinkedChart`, from that tune's own
      `chordChartId` — see `Tune`'s own doc comment in `@jam-practice/core/types` for how a tune
      gets linked to a chart in the first place). There used to be a second, separate post type
      (`communityChordCharts`/`communityChordChartSongs`, a chart or chart-playlist with no tune
      attached) — removed outright per an explicit request to stop the two post types from being
      "quite confusing": now there's exactly one thing to post, and a chart is just something a
      tune can optionally carry along with it. Searching for a chart specifically is still
      possible — see `convex/communityTunes.ts`'s `chartTitlesOf`/the `chartCount` field each
      summary carries, which is what a "chord charts" search scope filters on.
      Posting requires the caller's own profile to be `isPublic`; browsing just needs to be signed
      in, and a post is dropped from every read once its author's profile isn't (or is no longer)
      public, same privacy rule as everywhere else in this app.
      `likeCount` is denormalized here (kept in sync by `communityTunes.ts`'s `toggleLike`, inside
      the same mutation that writes `communityTuneLikes` below) specifically so showing a list of
      posts never has to separately count each one's own likes — the same "don't make reading a
      list cost more as more side-data piles up" reasoning `chordChartSongs`'s own metadata/`bars`
      split already follows elsewhere in this file. `optional` since every post created before
      liking existed doesn't have it — every reader treats a missing one as `0` (`row.likeCount ??
      0`), not a migration.
      `unlisted` (default `false`, same "missing means false" treatment as `likeCount`'s missing-
      means-zero) opts a post out of `list`/`listByUser` — the two *browsable* surfaces — without
      touching anything else: `get` (a direct link to the post, what "Share" copies) and `mine`
      (the poster's own post-management list) both work exactly the same regardless. The point
      isn't privacy from Convex's own access-control perspective (any signed-in account that
      already has `get`'s id can still open it, same as a listed post) — it's "don't show up where
      people browse," so a poster can share a link to something without it also becoming
      discoverable to everyone else. */
  communityTunes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    tunes: v.any(),
    likeCount: v.optional(v.number()),
    unlisted: v.optional(v.boolean()),
    /** "setlist" when posted as a setlist (an ordered list meant to be played in that order —
        shown numbered, savable as the viewer's own setlist); absent for a plain tune post. */
    kind: v.optional(v.literal("setlist")),
    /** The poster's own setlist id (from their synced setlists) — set for a setlist post, which
        then always shows that setlist's *current* tunes (`lib/setlists.ts`'s `liveSetlist`);
        `tunes` is just the fallback snapshot if the setlist's later deleted. */
    setlistId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  /** One row per `(userId, postId)` like — who liked what is never exposed (`communityTunes.ts`
      only ever reads this table scoped to *the caller's own* `userId`, via `by_user`/
      `by_user_post`; nothing reads it by `by_post` except to recount/cascade-delete, never to list
      likers), only the aggregate count (`communityTunes.likeCount`, above) and "did *I* like this"
      (`myLikes`) are ever exposed. `by_user_post` is what makes liking idempotent — `toggleLike`
      checks it first to decide insert-vs-delete, so double-tapping can't double-count. Liking
      requires being signed in (same as posting); there's no privacy gate on the *like* itself
      beyond that — if you can see a post at all (already filtered by the time a client has its id),
      you can like it. */
  communityTuneLikes: defineTable({
    userId: v.id("users"),
    postId: v.id("communityTunes"),
    createdAt: v.number(),
  })
    .index("by_user_post", ["userId", "postId"])
    .index("by_user", ["userId"])
    .index("by_post", ["postId"]),

  /** A signed-in user's personal Chord Charts library — replaces an earlier version of this
      feature that stored the *whole* library (every song's full parsed bar list) as one
      `syncedSettings` blob. That broke for real: importing a large iReal Pro playlist produced a
      single JSON document over Convex's 1 MiB per-document limit, and the write was rejected
      outright (`Value is too large (4.62 MiB > maximum size 1 MiB)`). Split across three tables
      instead, specifically so no single document's size grows with the size of the library:
      - `chordChartPlaylists` — just a name. Charts live once in the library ("All charts") and a
        playlist only *references* them, so one chart can be in several playlists. A chart's
        memberships are its own `playlistId` (optional — the first playlist it landed in, kept on
        the row so the common one-playlist case costs no extra reads and older data needs no
        migration) plus any `chordChartPlaylistEntries` rows. No `songIds` array on the playlist
        row, which would grow unboundedly for a big playlist.
      - `chordChartSongs` — one row per song, metadata only (title/composer/style/key/time
        signature) — deliberately *not* `bars`, so listing or deduping a library never has to
        touch each song's own (often much larger) notation.
      - `chordChartSongBars` — a song's parsed bar list, split into its own table so a single
        tune's notation is the only thing that ever has to fit under the 1 MiB limit, never the
        whole library or even a whole playlist. Fetched only for whichever one song is actually
        displayed (`convex/chordCharts.ts`'s `getSongBars`) — never all at once as part of listing
        the library. A chart posted to Community travels as part of its tune's own `linkedChart`
        snapshot (see `communityTunes`'s own comment) — `convex/lib/chordCharts.ts`'s
        `resolveLinkedChart` reads straight from this table server-side, never through the client.
      Signed out, this tool is entirely unaffected and keeps using the original single-blob
      `syncedSettings` approach via `lib/chordChartsLibrary.ts` — localStorage doesn't enforce
      anything like Convex's 1 MiB-per-document limit, so there's no equivalent failure mode to
      fix there. `convex/chordCharts.ts`'s `migrateFromSyncedSettings` is a one-time, entirely
      server-side migration for anyone who already had a (successfully-synced, and therefore
      already-under-1-MiB) library stored the old way before this change. */
  /** A setlist shared by link — a snapshot of one of the owner's setlists (which live in their
      synced settings, `jam-practice-setlists`): title, description, and its tunes as
      `PublicTune[]` with each linked chord chart resolved into a `linkedChart` snapshot (same shape
      and privacy rule as a Community post — never a tune's private `notes`). Readable by anyone
      with the id, signed in or not (`setlists.ts`'s `getShared`): sending the link is the sharing.
      Re-sharing updates the same row, so a link someone already has keeps working. */
  sharedSetlists: defineTable({
    userId: v.id("users"),
    /** The owner's setlist id — the link always shows that setlist's current version; the stored
        title/description/tunes are only a fallback if it's deleted. */
    setlistId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    tunes: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  chordChartPlaylists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    /** Being deleted: hidden from the library at once while its charts are removed in batches
        in the background (`chordCharts.ts`'s `purgePlaylist`) — one mutation can't delete a
        1,000+ chart playlist within Convex's per-function read limit. */
    deleting: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  chordChartSongs: defineTable({
    userId: v.id("users"),
    /** One playlist this chart is in (see `chordChartPlaylists`'s comment) — absent when it's in
        none, or only in playlists listed in `chordChartPlaylistEntries`. */
    playlistId: v.optional(v.id("chordChartPlaylists")),
    title: v.string(),
    composer: v.string(),
    style: v.string(),
    key: v.string(),
    timeSignature: v.object({ top: v.number(), bottom: v.number() }),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_playlist", ["playlistId"]),

  /** A chart's *other* playlist memberships, beyond `chordChartSongs.playlistId`. */
  chordChartPlaylistEntries: defineTable({
    userId: v.id("users"),
    playlistId: v.id("chordChartPlaylists"),
    songId: v.id("chordChartSongs"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_playlist", ["playlistId"])
    .index("by_song", ["songId"]),

  chordChartSongBars: defineTable({
    songId: v.id("chordChartSongs"),
    bars: v.any(),
  }).index("by_song", ["songId"]),

  /** Audio recordings (the Recorder tool): the file lives in Convex file storage, this row holds
      what's shown about it. `tuneId` links it to one of the owner's tunes — tunes live inside the
      owner's `syncedSettings` blob (`"tunes"` / `"jam-practice-tunes-to-learn"`), so it's a plain
      string id, not a document id; a recording whose tune has since been deleted just shows as
      unlinked. Private to the owner. */
  recordings: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    notes: v.string(),
    durationSec: v.number(),
    mimeType: v.string(),
    tuneId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_tune", ["userId", "tuneId"]),
});
