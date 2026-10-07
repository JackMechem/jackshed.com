import { BookIcon } from '@/components/icons';
import { useSyncedTunes } from '@/lib/useSyncedTunes';

import { TuneListManager } from './TuneListManager';

/** The account page's own "Tunes" tab — wires the shared `TuneListManager` up to the same tune
    list Jam Practice itself reads (`useSyncedTunes()`), mirroring
    `apps/web/components/TunesTab.tsx`. `allowStandards` matches web: `+` opens the shared jazz-
    standards picker, same as Jam Practice's own `+`. `BookIcon` stands in for web's own
    `ListIcon`, which hasn't been ported to `icons.tsx` yet — close enough in meaning for this one
    header icon. */
export function TunesTab() {
  const [tunes, setTunes] = useSyncedTunes();

  return (
    <TuneListManager
      title="Tunes"
      icon={BookIcon}
      tunes={tunes}
      setTunes={setTunes}
      searchPlaceholder="Search your tunes…"
      emptyMessage="No tunes yet — tap + to add one."
      allowStandards
    />
  );
}
