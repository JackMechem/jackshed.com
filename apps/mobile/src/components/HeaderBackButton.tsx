import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { ArrowLeftIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A custom `headerLeft` for every screen's native stack header, per a direct request ("make the
 * back button on all the pages look better") — the default native-stack back button is just a
 * bare tinted chevron (plus, on iOS, the previous screen's own title as a label), which reads as
 * plain/unstyled next to this app's own icon-button convention (a small round `surface`-colored
 * circle, used for the Metronome's "Options" button, Home's "Theme" button, every account-page
 * close button, ...). Wired into `_layout.tsx`'s `Stack` `screenOptions.headerLeft` once, rather
 * than per-screen, so every screen that gets a real header automatically gets this instead of the
 * platform default. Renders nothing on a screen with no back history (the stack's own root),
 * matching the default back button's own behavior of simply not showing there.
 */
export function HeaderBackButton() {
  const router = useRouter();
  const { colors } = useAppTheme();

  if (!router.canGoBack()) return null;

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityLabel="Go back"
      accessibilityRole="button"
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: colors.surface, marginRight: 12 }}
    >
      <ArrowLeftIcon color={colors.foreground} size={18} />
    </Pressable>
  );
}
