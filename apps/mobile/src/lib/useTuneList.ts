import type { Tune } from '@jam-practice/core/types';

import { useSyncedTunes, useTunesToLearn } from '@/lib/useSyncedTunes';

/** Which of the two tune lists: Tunes I Know ("tunes" — the one Jam Practice picks from) or
    Tunes to Learn. */
export type TuneListId = 'tunes' | 'learn';

export const TUNE_LIST_LABEL: Record<TuneListId, string> = { tunes: 'Tunes I Know', learn: 'Tunes to Learn' };

type Setter = (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;

/** Both tune lists at once (both hooks always run, per rules-of-hooks), so screens that work with
    either — or move a tune from one to the other — have one place to get them. */
export function useTuneLists() {
  const [tunes, setTunes, tunesReady] = useSyncedTunes();
  const [learn, setLearn, learnReady] = useTunesToLearn();
  const lists: Record<TuneListId, { tunes: Tune[]; setTunes: Setter }> = {
    tunes: { tunes, setTunes },
    learn: { tunes: learn, setTunes: setLearn },
  };
  return { lists, ready: tunesReady && learnReady };
}

export function asTuneListId(value: string | undefined): TuneListId {
  return value === 'learn' ? 'learn' : 'tunes';
}

export function tuneSummary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [keys.join(', ') || null, tempos.length ? `${tempos.join(', ')} BPM` : null, tune.timeSignature]
    .filter(Boolean)
    .join(' · ');
}
