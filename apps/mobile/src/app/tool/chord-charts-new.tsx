import { sortByText } from '@jam-practice/core/sortText';
import { UNSORTED_PLAYLIST_ID } from '@jam-practice/core/chordChartsLibrary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { CheckIcon, FolderIcon, FolderPlusIcon } from '@/components/icons';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

/**
 * "New chord chart" details, as a full page rather than a bottom sheet — a sheet's text fields sat
 * right where the keyboard slides up, which was reported as annoying to type into. Here the text
 * fields come first (Title focused on open) at the top of the screen, the playlist picker (tap-only,
 * no keyboard) below them, and "Start building" lives in the header so the keyboard never covers it.
 * Every chart must be in a playlist: pick one or name a new one. On continue this *replaces* itself
 * with the chart builder (`chord-charts-editor`), passing the details along, so back from the
 * builder returns to the list rather than to this form.
 */
function NewChordChartScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ playlist?: string; title?: string }>();
  const { playlists: raw, loading } = useChordChartsLibrary(null);
  const playlists = sortByText(
    raw.filter((p) => p.id !== UNSORTED_PLAYLIST_ID).map((p) => p.name),
    (name) => name,
  );

  const [title, setTitle] = useState(params.title ?? '');
  const [composer, setComposer] = useState('');
  const [style, setStyle] = useState('');
  const [key, setKey] = useState('');
  // `undefined` = nothing picked yet (falls back to the first playlist); `null` = "New playlist…".
  const [picked, setPicked] = useState<string | null | undefined>(params.playlist);
  const [newPlaylist, setNewPlaylist] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chosen = picked === undefined ? (playlists[0] ?? null) : picked;

  function submit() {
    const playlist = chosen ?? newPlaylist.trim();
    if (!title.trim()) return setError('Give the chart a title.');
    if (!playlist) return setError('Pick a playlist, or name a new one.');
    router.replace({
      pathname: '/tool/chord-charts-editor',
      params: { playlist, title: title.trim(), composer: composer.trim(), style: style.trim(), key: key.trim() },
    });
  }

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.foreground,
  };

  // The playlist list would otherwise appear empty and then fill in.
  if (loading) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'New chart',
          headerRight: () => (
            <Pressable onPress={submit} className="rounded-full px-4 py-2" style={{ backgroundColor: colors.accent }}>
              <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                Start building
              </Text>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 + TAB_BAR_CONTENT_HEIGHT }}
        >
          <Field label="Title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Tune name"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
              className="font-inter text-base"
              style={inputStyle}
            />
          </Field>
          <Field label="Composer">
            <TextInput value={composer} onChangeText={setComposer} placeholder="Optional" placeholderTextColor={colors.muted} className="font-inter text-base" style={inputStyle} />
          </Field>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Style">
                <TextInput value={style} onChangeText={setStyle} placeholder="Medium Swing" placeholderTextColor={colors.muted} className="font-inter text-base" style={inputStyle} />
              </Field>
            </View>
            <View style={{ width: 110 }}>
              <Field label="Key">
                <TextInput value={key} onChangeText={setKey} placeholder="Bb" placeholderTextColor={colors.muted} autoCorrect={false} className="font-inter text-base" style={inputStyle} />
              </Field>
            </View>
          </View>

          <Field label="Playlist">
            <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
              {playlists.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => setPicked(name)}
                  android_ripple={{ color: colors['surface-hover'] }}
                  className="flex-row items-center gap-3 px-3"
                  style={{ minHeight: 52 }}
                >
                  <FolderIcon color={chosen === name ? colors.accent : colors.muted} size={20} />
                  <Text numberOfLines={1} className="font-inter-semibold flex-1 text-base font-semibold" style={{ color: colors.foreground }}>
                    {name}
                  </Text>
                  {chosen === name ? <CheckIcon color={colors.accent} size={20} /> : null}
                </Pressable>
              ))}
              <View className="flex-row items-center gap-3 px-3" style={{ minHeight: 52 }}>
                <FolderPlusIcon color={chosen === null ? colors.accent : colors.muted} size={20} />
                <TextInput
                  value={newPlaylist}
                  onChangeText={setNewPlaylist}
                  onFocus={() => setPicked(null)}
                  placeholder="New playlist…"
                  placeholderTextColor={colors.muted}
                  className="font-inter flex-1 text-base"
                  style={{ color: colors.foreground, paddingVertical: 10 }}
                />
                {chosen === null ? <CheckIcon color={colors.accent} size={20} /> : null}
              </View>
            </View>
          </Field>

          {error ? (
            <Text className="font-inter text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="font-inter-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export default withScreenLoader(NewChordChartScreen);
