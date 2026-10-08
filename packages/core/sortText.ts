/**
 * Case-insensitive alphabetical sorting that's fast on Android. `String.prototype.localeCompare`
 * (and `.normalize()`) go through a native call per invocation on Hermes, React Native's JS engine
 * on Android, so sorting a few hundred items with it can take *seconds*: it was what made Jam
 * Practice take ~2–3s to open, since the ~630 jazz standards were sorted that way the moment
 * `standards.ts` loaded. This builds each item's lowercase sort key once and then compares plain
 * strings — no native calls inside the sort.
 */
export function sortKey(text: string): string {
  return text.toLowerCase().replace(/^[^a-z0-9]+/, "");
}

export function sortByText<T>(items: readonly T[], getText: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, key: sortKey(getText(item)) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.item);
}
