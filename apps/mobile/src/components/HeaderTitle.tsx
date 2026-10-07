import { Text } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A native stack `headerTitle` render for every screen's header — plain accent-colored bold text,
 * matching the same look a brief detour gave it (bars-behind-text, like the "sheddex" wordmark)
 * before that was reverted per a direct request ("forget about the bars behind the page titles,
 * remove it... keep the exact formatting of the text you have though"). `numberOfLines={1}`
 * truncates (rather than wraps) an unusually long title — this app's longest real title,
 * "Polyrhythm Metric Modulation Metronome", otherwise wraps onto two lines once the header's back
 * button eats into the available width.
 */
export function HeaderTitle({ children }: { children?: string }) {
  const { colors } = useAppTheme();
  if (!children) return null;
  return (
    <Text
      numberOfLines={1}
      className="text-lg font-bold font-inter-bold tracking-tight"
      style={{ color: colors.accent }}
    >
      {children}
    </Text>
  );
}
