"use client";

import TuneListManager from "@/components/TuneListManager";
import { ListIcon } from "@/components/tools";
import { useSyncedTunes } from "@/lib/useSyncedTunes";

/** The Account page's own "Tunes" tab — a from-scratch layout, deliberately **not** `TunesPanel`
    (Jam Practice's own compact sidebar-panel version — untouched, per an explicit request not to
    touch Jam Practice while building this). Just wires the shared `TuneListManager` layout up to
    Jam Practice's own tune list (`useSyncedTunes()`) with standards-adding turned on — see that
    component's own doc comment for the actual UI/behavior. */
export default function TunesTab() {
  const [tunes, setTunes] = useSyncedTunes();

  return (
    <TuneListManager
      title="Tunes I Know"
      icon={ListIcon}
      tunes={tunes}
      setTunes={setTunes}
      allowStandards
      listId="tunes"
      searchPlaceholder="Search your tunes…"
      emptyMessage="No tunes yet — press + to search jazz standards or create your own."
      exportFilenamePrefix="jam-practice-tunes"
    />
  );
}
