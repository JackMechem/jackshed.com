import { StarIcon } from '@/components/icons';
import { useTunesToLearn } from '@/lib/useSyncedTunes';

import { TuneListManager } from './TuneListManager';

/** The account page's own "Tunes to Learn" tab — a personal bookmark list, kept separate from the
    owner's own Tunes list. On web, everything on this list arrives by visiting someone else's
    public profile and tapping "Learn"; mobile has no public-profile-viewing screen yet (an
    unstarted, separate task), so for now this tab is reachable but only ever populated by adding
    tunes directly here — still useful on its own as a second, differently-purposed list.
    `allowStandards` matches web's own choice to offer the jazz-standards picker here too, per a
    direct request — useful for bookmarking a standard to learn without adding it to the actual
    practice list. */
export function TunesToLearnTab() {
  const [tunes, setTunes] = useTunesToLearn();

  return (
    <TuneListManager
      title="Tunes to Learn"
      icon={StarIcon}
      tunes={tunes}
      setTunes={setTunes}
      searchPlaceholder="Search tunes to learn…"
      emptyMessage="Nothing here yet — bookmark a tune from someone's public profile, or add one directly."
      allowStandards
    />
  );
}
