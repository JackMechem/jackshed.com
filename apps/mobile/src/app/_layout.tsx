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

import { useRecordToolVisits } from '@/lib/toolRecents';
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
  useRecordToolVisits();

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
        {/* Titles up front, so the header is right the instant a screen is pushed — each screen
            mounts its real content a frame later (see `components/ScreenLoader.tsx`), and its own
            <Stack.Screen options> only apply once it mounts. Dynamic titles ('') fill in then. */}
        <Stack.Screen name="liked-posts" options={{ title: 'Liked Posts' }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
        <Stack.Screen name="u/[username]" options={{ title: 'Profile' }} />
        <Stack.Screen name="tool/chord-charts" options={{ title: 'Chord Charts' }} />
        <Stack.Screen name="charts/index" options={{ headerShown: false }} />
        <Stack.Screen name="charts/import" options={{ title: 'Import charts' }} />
        <Stack.Screen name="tool/chord-charts-playlist" options={{ title: '' }} />
        <Stack.Screen name="tool/chord-charts-view" options={{ title: '' }} />
        <Stack.Screen name="tool/chord-charts-new" options={{ title: 'New chart' }} />
        <Stack.Screen name="tool/chord-charts-editor" options={{ title: '' }} />
        <Stack.Screen name="tool/community" options={{ headerShown: false }} />
        <Stack.Screen name="community/new" options={{ title: 'New post' }} />
        <Stack.Screen name="community/following" options={{ title: 'Following' }} />
        <Stack.Screen name="library/setlist" options={{ title: '' }} />
        <Stack.Screen name="library/setlists" options={{ title: 'Setlists' }} />
        <Stack.Screen name="setlist-charts" options={{ title: '' }} />
        <Stack.Screen name="setlist/[id]" options={{ title: 'Setlist' }} />
        <Stack.Screen name="tool/guess-the-chord" options={{ title: 'Guess the Chord' }} />
        <Stack.Screen name="tool/guess-the-interval" options={{ title: 'Guess the Interval' }} />
        <Stack.Screen name="tool/interval-trainer" options={{ title: 'Interval Trainer' }} />
        <Stack.Screen name="tool/slow-downer" options={{ title: 'Slow Downer' }} />
        <Stack.Screen name="tool/jam-practice" options={{ title: 'Jam Practice' }} />
        <Stack.Screen name="tool/metronome" options={{ title: 'Metronome' }} />
        <Stack.Screen name="tool/note-trainer" options={{ title: 'Note Trainer' }} />
        <Stack.Screen name="tool/practice-timer" options={{ title: 'Practice Timer' }} />
        <Stack.Screen name="tool/scale-trainer" options={{ title: 'Scale Trainer' }} />
        <Stack.Screen name="tool/tempo-trainer" options={{ title: 'Tempo Trainer' }} />
        <Stack.Screen name="tool/tuner" options={{ title: 'Tuner' }} />
        <Stack.Screen name="account/public-profile" options={{ title: 'Public profile' }} />
        <Stack.Screen name="library/index" options={{ headerShown: false }} />
        <Stack.Screen name="library/tunes" options={{ title: '' }} />
        <Stack.Screen name="library/tune" options={{ title: '' }} />
        <Stack.Screen name="library/tune-edit" options={{ title: 'Edit tune' }} />
        <Stack.Screen name="library/tune-notes" options={{ title: 'Notes' }} />
        <Stack.Screen name="account/posts" options={{ title: 'My posts' }} />
        <Stack.Screen name="account/security" options={{ title: 'Security' }} />
        <Stack.Screen name="account/delete-account" options={{ title: 'Delete account' }} />
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
