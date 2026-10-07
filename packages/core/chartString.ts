import type { IRealPlaylist, IRealSong } from "./iRealPro";

// sheddex's own plain-string format for sharing a chord chart or a small chart "playlist" —
// deliberately similar in spirit to iReal Pro's own `irealb://...` links (one opaque,
// copy-pasteable string) but not tied to iReal's scrambled/compressed encoding or its own
// plain-text chart grammar at all: just the exact same `IRealSong`/`Bar` shape this app already
// parses iReal charts into, UTF-8-safe base64-encoded behind a distinct scheme prefix.
// `ChordCharts.tsx`'s "Import a playlist" box reads this format first, and quietly still falls
// back to reading a real iReal Pro link too if what's pasted isn't one of these — kept working on
// purpose, just never mentioned anywhere in that panel's own copy; see that file's own
// `parsePlaylistInput`.
const SCHEME = "sheddex://";

function toBase64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeChartString(playlist: IRealPlaylist): string {
  return SCHEME + toBase64(JSON.stringify(playlist));
}

export function looksLikeChartString(input: string): boolean {
  return input.trim().startsWith(SCHEME);
}

/** Tolerant of malformed/missing fields the same way `lib/profileTunes.ts`'s
    `resolvePublicTunes` is — a bad individual song is dropped rather than failing the whole
    import, and a missing field falls back to a sane default rather than throwing. */
function sanitizeSong(raw: unknown): IRealSong | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || !r.title.trim()) return null;
  const ts = (r.timeSignature ?? {}) as { top?: unknown; bottom?: unknown };
  const top = typeof ts.top === "number" && ts.top > 0 ? ts.top : 4;
  const bottom = typeof ts.bottom === "number" && ts.bottom > 0 ? ts.bottom : 4;
  const bars = Array.isArray(r.bars) ? (r.bars as IRealSong["bars"]) : [];
  return {
    title: r.title,
    composer: typeof r.composer === "string" ? r.composer : "",
    style: typeof r.style === "string" ? r.style : "",
    key: typeof r.key === "string" ? r.key : "",
    timeSignature: { top, bottom },
    bars,
  };
}

/** Parses a `sheddex://...` chart link back into a playlist. Throws a short, user-facing message
    if the string isn't this format at all or its payload isn't readable JSON, matching
    `parseIrealPlaylist`'s own error-handling shape — but stays deliberately generic (never
    mentions iReal Pro), since `ChordCharts.tsx` falls back to that parser afterward and this
    error is the one a normal user actually sees. */
export function decodeChartString(input: string): IRealPlaylist {
  const trimmed = input.trim();
  if (!trimmed.startsWith(SCHEME)) {
    throw new Error("That doesn't look like a sheddex chord chart link.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64(trimmed.slice(SCHEME.length)));
  } catch {
    throw new Error("Couldn't read that chord chart link.");
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const songs = Array.isArray(obj.songs)
    ? obj.songs.map(sanitizeSong).filter((s): s is IRealSong => s !== null)
    : [];
  if (songs.length === 0) throw new Error("No songs found in that chord chart link.");
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name : "Imported chart";
  return { name, songs };
}
