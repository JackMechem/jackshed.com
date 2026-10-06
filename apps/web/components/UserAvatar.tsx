"use client";

import { UserIcon } from "@/components/tools";

/** A profile picture, or a plain fallback icon when there isn't one — reused everywhere an
    avatar shows up (the profile editor, a public profile page, community search results, and
    Following/Followers lists), so all of them render the exact same "no picture yet" state the
    same way instead of each inventing its own. Plain `<img>`, not `next/image` — these are
    user-uploaded, externally-hosted (Convex file storage) images of unpredictable dimensions,
    and this app doesn't otherwise use `next/image` anywhere (see `lib/sampledTones.ts`'s CDN
    fetches for the same "just use the platform, don't add ceremony" reasoning elsewhere here). */
export default function UserAvatar({
  url,
  size = "md",
  className = "",
}: {
  url: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dim =
    size === "sm"
      ? "h-8 w-8"
      : size === "lg"
        ? "h-16 w-16"
        : size === "xl"
          ? "h-24 w-24"
          : "h-11 w-11";
  const iconDim =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : size === "xl" ? "h-10 w-10" : "h-5 w-5";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- externally-hosted, unpredictable dimensions; see the file-level comment above.
      <img
        src={url}
        alt=""
        className={`${dim} shrink-0 rounded-full bg-surface object-cover ring-1 ring-foreground/10 ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-foreground/10 ${className}`}
    >
      <UserIcon className={iconDim} />
    </span>
  );
}
