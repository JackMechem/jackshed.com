import { useConvexAuth } from '@convex-dev/auth/react';

import { useSyncedSettings } from './useSyncedSettings';

const FAVORITES_KEY = 'jam-practice-favorites';
const DEFAULT_FAVORITES = { hrefs: [] as string[] };

/**
 * The native sibling of `apps/web/lib/useFavorites.ts` — same fixed `syncedSettings` key
 * (`"jam-practice-favorites"`), so a tool favorited here shows up favorited on web too, not a
 * second, mobile-only list. **Account-only, matching web's own explicit design choice, not this
 * app's usual offline-first default**: `useSyncedSettings` itself still caches to `AsyncStorage`
 * underneath regardless, but this hook only ever surfaces that while signed in — web's own doc
 * comment reasoning applies unchanged here too ("which tools you reach for most is tied to *you*,
 * not a particular device").
 */
export function useFavorites() {
  const { isAuthenticated } = useConvexAuth();
  const [{ hrefs }, updateFavorites, ready] = useSyncedSettings(FAVORITES_KEY, DEFAULT_FAVORITES);

  function toggleFavorite(href: string) {
    updateFavorites({
      hrefs: hrefs.includes(href) ? hrefs.filter((h) => h !== href) : [...hrefs, href],
    });
  }

  return {
    favorites: isAuthenticated ? hrefs : DEFAULT_FAVORITES.hrefs,
    toggleFavorite,
    isAuthenticated,
    ready,
  };
}
