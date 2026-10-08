"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/library/shared";
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { BookIcon, ListIcon } from "@/components/tools";
import TuneListManager from "@/components/TuneListManager";

/** Every tune in one list (Tunes I Know or Tunes to Learn) — search, add (jazz standards or your
    own), edit, bulk select/export/import/delete; each tune's name opens its own page. */
export default function TuneListPage({ list }: { list: TuneListId }) {
  const router = useRouter();
  const lists = useTuneLists();
  return (
    <PageShell>
      <button type="button" onClick={() => router.push("/tunes")} className="-mb-4 self-start text-sm text-muted hover:text-foreground">
        ← Tunes
      </button>
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
