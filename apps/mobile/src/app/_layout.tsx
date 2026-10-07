import '../global.css';

import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { HeaderTitle } from '@/components/HeaderTitle';
import { PracticeTimerAlert } from '@/components/PracticeTimerAlert';
import { PracticeTimerWidget } from '@/components/PracticeTimerWidget';
import { ConvexClientProvider } from '@/convex/ConvexClientProvider';
import { useAppTheme, ThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

/**
 * Per a direct request ("i dont like the font its using... can you use inter?") — nothing in this
 * app loaded a custom font before this, so every `Text` rendered in whatever system default font
 * React Native falls back to (Roboto/San Francisco), not the `--font-display` stack `global.css`
 * declares (that CSS variable was never actually applied anywhere — confirmed by grepping for
 * `fontFamily` across `src/` and finding zero matches). Inter is loaded here (`useFonts` below)
 * and applied via four plain NativeWind classes instead of a global default: `font-inter`/
 * `font-inter-semibold`/`font-inter-bold`/`font-inter-extrabold` (`tailwind.config.js`), one per
 * `<Text>` matching whatever weight it already used (`font-bold` etc.) — the usual
 * `Text.defaultProps.style` trick for a global default doesn't apply anymore: `Text` is a plain
 * function component in this React Native version (confirmed by reading its real source,
 * `node_modules/react-native/Libraries/Text/Text.js`), which carries no `defaultProps` at all
 * (also confirmed directly — `tsc` correctly refuses `Text.defaultProps` as a type error). A
 * single custom TTF also has no synthetic-bold fallback the way a system font does, so pairing the
 * exact matching weighted cut with each existing `font-bold`/`font-semibold`/`font-extrabold`
 * className (rather than one blanket regular default) is what's required for those to actually
 * render bold, not just switch fonts.
 */

/**
 * Root navigation shell — a plain `Stack` plus the floating tab bar. There's no drawer/hamburger
 * menu anymore: a direct request collapsed Home and "the menu" into one screen ("I don't really
 * want a home page at all, I want the menu to be the home page") — Home (`app/index.tsx`) now
 * *is* the full tool browser, so there's nothing left for a separate slide-out panel to hold.
 * `react-native-drawer-layout`/`Sidebar.tsx`/`DrawerController` were all removed outright once
 * nothing referenced them anymore, not left as unreferenced dead code.
 */
function RootNavigator() {
  const { colors } = useAppTheme();

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerTitleAlign: 'left',
          headerLeft: () => <HeaderBackButton />,
          headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="tool/[slug]" options={{ title: '' }} />
        <Stack.Screen name="theme" options={{ title: 'Theme', headerLargeTitle: true }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
      {/* A sibling of Stack so it persists across navigation instead of remounting per screen. */}
      <FloatingTabBar />
      {/* Both read the Practice Timer engine directly and render nothing while no session is
          running — mounted app-wide (not inside the tool screen itself) so the widget stays
          visible on every page and the full-screen alert can interrupt you anywhere. */}
      <PracticeTimerWidget />
      <PracticeTimerAlert />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    // The two Petaluma faces Chord Charts renders notation through — see
    // `components/ChordChart.tsx`'s own doc comment for why it's two faces, not one
    // (`PetalumaScript` for root letters/digits/most of a quality suffix, `Petaluma` itself for
    // the two SMuFL glyphs — Δ and ° — that face doesn't cover). Loaded globally, once, the same
    // as Inter, rather than per-screen, since both are small (under 400KB combined) and a chord
    // chart can be reached from more than one route (the tool itself, a tiled pane, eventually a
    // Community post preview).
    Petaluma: require('../assets/fonts/petaluma/Petaluma.otf'),
    PetalumaScript: require('../assets/fonts/petaluma/PetalumaScript.otf'),
  });

  // Keep the native splash screen up (already held via `preventAutoHideAsync()` above) until
  // Inter's own files are actually loaded — otherwise the very first frame would briefly flash
  // the system default font before swapping to Inter.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexClientProvider>
        <ThemeProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ThemeProvider>
      </ConvexClientProvider>
    </GestureHandlerRootView>
  );
}
