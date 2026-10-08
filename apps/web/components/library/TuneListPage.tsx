"use client";

import { BackButton, PageShell } from "@/components/library/shared";
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { BookIcon, ListIcon } from "@/components/tools";
import TuneListManager from "@/components/TuneListManager";

/** Every tune in one list (Tunes I Know or Tunes to Learn) — search, add (jazz standards or your
    own), edit, bulk select/export/import/delete; each tune's name opens its own page. */
export default function TuneListPage({ list }: { list: TuneListId }) {
  const lists = useTuneLists();
  return (
    <PageShell>
      <BackButton href="/tunes" label="Tunes" className="-mb-4" />
      <TuneListManager
        title={TUNE_LIST_LABEL[list]}
        icon={list === "learn" ? BookIcon : ListIcon}
        tunes={lists[list].tunes}
        setTunes={lists[list].setTunes}
        allowStandards
        listId={list}
        searchPlaceholder={list === "learn" ? "Search your tunes to learn…" : "Search the tunes you know…"}
        emptyMessage="Nothing here yet — press + to add a jazz standard or your own tune."
        exportFilenamePrefix={list === "learn" ? "jam-practice-tunes-to-learn" : "jam-practice-tunes"}
      />
    </PageShell>
  );
}
