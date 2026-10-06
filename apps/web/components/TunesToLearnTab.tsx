"use client";

import TuneListManager from "@/components/TuneListManager";
import { BookIcon } from "@/components/tools";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

/** The Account page's "Tunes to Learn" tab — a personal bookmark list of tunes seen on other
    people's public profiles (added via `components/PublicTuneList.tsx`'s "Learn" action —
    `lib/useTunesToLearn.ts`) or picked straight from the jazz standards library, kept as its own
    separate list from your own Jam Practice tune list (the "Tunes" tab, `TunesTab.tsx`) even
    though both hold the same `Tune` shape and now share the exact same `TuneListManager` layout —
    per a direct request to put that UI here too. `allowStandards` is on, same as the Tunes tab, per
    a direct follow-up request: `+` opens the same search-631-jazz-standards-or-create-custom modal
    Jam Practice itself uses, but a standard picked from here is added to *this* list, not the main
    Tunes list — a real use case (bookmarking a standard you want to learn without adding it to your
    own practice list yet), not just visual consistency. */
export default function TunesToLearnTab() {
  const [tunes, setTunes] = useTunesToLearn();

  return (
    <TuneListManager
      title="Tunes to Learn"
      icon={BookIcon}
      tunes={tunes}
      setTunes={setTunes}
      allowStandards
      searchPlaceholder="Search your tunes to learn…"
      emptyMessage="Nothing here yet — press + to search jazz standards, or find a tune on someone's public profile."
      exportFilenamePrefix="jam-practice-tunes-to-learn"
      infoBlurb="Tunes bookmarked from other people's public profiles, or the jazz standards library — separate from your own tune list."
    />
  );
}
