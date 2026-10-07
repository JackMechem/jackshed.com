import { ConvexAuthProvider, type TokenStorage } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

/**
 * The native side of `apps/web/components/ConvexClientProvider.tsx` — same deployment
 * (`EXPO_PUBLIC_CONVEX_URL`, the Expo-prefixed equivalent of web's `NEXT_PUBLIC_CONVEX_URL`, both
 * pointing at the same dev Convex deployment per `apps/mobile/.env.local`'s own comment), same
 * `@convex-dev/auth` package, same backend (`packages/convex`) — accounts, tunes, chord charts,
 * everything already built there is reachable from here too, not a separate backend.
 *
 * The one real difference: Convex Auth's React provider defaults to `localStorage` for storing
 * the session's JWT/refresh token, which doesn't exist in React Native — its own doc comment is
 * explicit that a `storage` prop is "must... set this for React Native," recommending exactly this
 * wrap-`expo-secure-store` shape (the OS keychain/keystore, not plain `AsyncStorage`, since this is
 * a real auth token, not a settings blob).
 *
 * `expo-secure-store`'s own web implementation doesn't actually implement the method this storage
 * interface calls (confirmed directly: `ExpoSecureStore.default.getValueWithKeyAsync is not a
 * function`, thrown the moment anything touches it in a real browser) — this app is mobile-only
 * (web is a dev/bundling convenience, not a real target, per this app's own strategic pivot), but
 * that web path still needs to not *crash*, since it's also this sandbox's own most reliable way
 * to verify screens without a stable device connection. `Platform.OS === 'web'` swaps in a plain
 * `localStorage` adapter there instead — not a feature either platform actually needs, purely so
 * a web session doesn't throw before anything else on the page gets a chance to render.
 */
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const storageAdapter: TokenStorage =
  Platform.OS === 'web'
    ? {
        getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
        setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
        removeItem: (key) => globalThis.localStorage?.removeItem(key),
      }
    : {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) => SecureStore.setItemAsync(key, value),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      };

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex} storage={storageAdapter}>
      {children}
    </ConvexAuthProvider>
  );
}
