/** Shares a link with the device's own share sheet when there is one (phones, some desktops),
    otherwise copies it. Returns what happened, so the caller can say "Link copied". A dismissed
    share sheet counts as shared — nothing to report. */
export async function shareLink(title: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: title, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
      // fall through to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
