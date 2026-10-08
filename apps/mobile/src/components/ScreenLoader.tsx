import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAppTheme } from '@/theme/ThemeProvider';

/** A full-screen centered loading spinner on the theme background — what every screen shows while
    its content (or the data it depends on) is still on the way. */
export function ScreenSpinner({ label }: { label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <LoadingSpinner showLabel={!!label} label={label ?? 'Loading…'} />
    </View>
  );
}

/**
 * Wraps a route's screen so navigating to it is instant. A native stack doesn't start sliding a
 * screen in until that screen's first render has committed, so a heavy screen (the account page's
 * tabs, the big trainers) made every tap that opened it feel like a stall of up to a second. This
 * renders only a spinner on the first frame — cheap, so the push starts right away — and mounts the
 * real screen a frame later, while the (native, off-JS-thread) slide animation is already running.
 *
 * Headers are unaffected: each route's title is registered statically in `app/_layout.tsx`, so it
 * shows immediately; a screen's own `<Stack.Screen options>` (dynamic titles, header buttons)
 * apply once it mounts. Screens whose content depends on data still show their own spinner after
 * this one until that data is ready (`ScreenSpinner`), so the sequence is always: instant screen →
 * spinner → content, never a blank or half-filled page.
 */
export function withScreenLoader<P extends object>(Screen: ComponentType<P>) {
  function LoadedScreen(props: P) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      let second = 0;
      // Two frames: the first lets the spinner frame commit and the push begin.
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setMounted(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }, []);
    return mounted ? <Screen {...props} /> : <ScreenSpinner />;
  }
  LoadedScreen.displayName = `withScreenLoader(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return LoadedScreen;
}
