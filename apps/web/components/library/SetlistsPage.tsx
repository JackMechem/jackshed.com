"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PromptDialog from "@/components/PromptDialog";
import { PageHeader, PageShell, SearchBox } from "@/components/library/shared";
import { SetlistRow, setlistHref } from "@/components/library/setlistParts";
import { useTuneLists } from "@/components/library/useTuneActions";
import { PlusIcon } from "@/components/tools";
import { useSetlists } from "@/lib/useSetlists";
import { sortByText } from "@jam-practice/core/sortText";

type Sort = "recent" | "name";

/** Every setlist — the Tunes page's "See all" for setlists. Searchable (by setlist name, its
    description, or any tune in it), sorted by most recently changed or A–Z; + makes a new one. */
export default function SetlistsPage() {
  const router = useRouter();
  const { setlists, create } = useSetlists();
  const lists = useTuneLists();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [naming, setNaming] = useState(false);

  const shown = useMemo(() => {
    const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes].map((t) => [t.id, t.name]));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? setlists.filter((s) => {
          const hay = [s.name, s.description, ...s.tuneIds.map((id) => nameOf.get(id) ?? "")].join(" ").toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : setlists;
    return sort === "name" ? sortByText(filtered, (s) => s.name) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [setlists, lists.tunes.tunes, lists.learn.tunes, query, sort]);

  return (
    <PageShell>
      <PageHeader
        title="Setlists"
        back={() => router.push("/tunes")}
        actions={
          <button
            type="button"
            onClick={() => setNaming(true)}
            aria-label="New setlist"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />
      <SearchBox value={query} onChange={setQuery} placeholder={`Search ${setlists.length} setlists…`} />
      <div className="-mt-3 flex gap-2">
        {(["recent", "name"] as Sort[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${sort === key ? "bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-hover"}`}
          >
            {key === "recent" ? "Recent" : "A–Z"}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{query ? `No setlists match “${query}”.` : "No setlists yet — press + to make one."}</p>
        ) : (
          shown.map((s) => <SetlistRow key={s.id} setlist={s} />)
        )}
      </div>
      {naming && (
        <PromptDialog
          title="New setlist"
          initialValue=""
          confirmLabel="Create"
          onSubmit={(name) => {
            setNaming(false);
            router.push(setlistHref(create(name).id));
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </PageShell>
  );
}
