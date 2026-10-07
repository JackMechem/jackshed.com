import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchIcon, ThemeIcon } from '@/components/icons';
import { ToolGrid } from '@/components/ToolGrid';
import { Wordmark } from '@/components/Wordmark';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The app's landing screen — and, per a direct request, the *only* menu screen too: "I don't
 * really want a home page at all, I want the menu to be the home page." There used to be a
 * separate hamburger-triggered drawer (`Sidebar.tsx`, now deleted) holding almost this exact same
 * content; collapsing the two into one screen is strictly simpler, not a compromise — the
 * `FloatingTabBar` already gives Home its own permanent tab, so there's no longer a need for a
 * second way to "get back to the menu" the way a drawer existed for.
 *
 * A fixed header row (wordmark left, a Theme button right — opening `/theme` directly, per a
 * direct request moving it out of the scrollable list and into the header) plus a fixed search
 * pill, then `ToolGrid`'s scrollable card grid below.
 */
export default function Home() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 pb-5 pt-4">
          <Wordmark size="sm" height={40} textClassName="text-2xl" />
          <Pressable
            onPress={() => router.push('/theme')}
            accessibilityLabel="Theme"
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
          >
            <ThemeIcon color={colors.foreground} size={20} />
          </Pressable>
        </View>

        <View className="px-5 pb-4">
          <View
            className="flex-row items-center gap-2.5 rounded-full px-4 py-1"
            style={{ backgroundColor: colors.surface }}
          >
            <SearchIcon color={colors.muted} size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search tools, tunes, trainers…"
              placeholderTextColor={colors.muted}
              className="flex-1 text-base font-inter"
              style={{ color: colors.foreground }}
            />
          </View>
        </View>

        <ToolGrid query={query} />
      </SafeAreaView>
    </View>
  );
}
