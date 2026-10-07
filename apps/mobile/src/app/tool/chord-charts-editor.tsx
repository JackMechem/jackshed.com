import * as Clipboard from 'expo-clipboard';
import { encodeChartString } from '@jam-practice/core/chartString';
import { parseBarSlots, type Bar, type IRealSong } from '@jam-practice/core/iRealPro';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarContent, groupRows, PageFit, QUALITY_SIZE, Row, BAR_HEIGHT, COL_WIDTH } from '@/components/ChordChartView';
import { ChordKeyboard } from '@/components/ChordKeyboard';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { NumberStepper } from '@/components/NumberStepper';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

const STARTING_BARS = 4;
const BARS_PER_ROW = 4;

type EditableBar = {
  text: string;
  hasSection: boolean;
  section: string;
  startRepeat: boolean;
  endRepeat: boolean;
  coda: boolean;
  isRepeatBar: boolean;
};

function blankBar(): EditableBar {
  return { text: '', hasSection: false, section: '', startRepeat: false, endRepeat: false, coda: false, isRepeatBar: false };
}

/** The exact same `Bar` shape a pasted iReal chart already produces — see
    `apps/web/components/ChordChartEditor.tsx`'s own `toRealBar` (this is a direct, unmodified
    port of its logic). */
function toRealBar(eb: EditableBar): Bar {
  const bar: Bar = {
    content: eb.isRepeatBar ? { kind: 'repeat' } : { kind: 'chords', slots: parseBarSlots(eb.text) },
  };
  if (eb.hasSection) {
    bar.section = eb.section.trim();
    bar.newRow = true;
  }
  if (eb.startRepeat) bar.startRepeat = true;
  if (eb.endRepeat) bar.endRepeat = true;
  if (eb.coda) bar.coda = true;
  return bar;
}

/**
 * The mobile chart builder — a full-page route (`router.push`'d from the main Chord Charts
 * screen), not a modal, matching web's own "takes up the entire view" redesign. Typing happens
 * directly on the chart itself, same principle as web: the bar grid is built from
 * `ChordChartView.tsx`'s own `Row`/`BarContent`/`groupRows`/`PageFit` — the *same* components the
 * real chart view renders with — via the one optional addition that file exposes just for this
 * (`renderBarContent`). The one bar currently being typed into shows a plain-text `TextInput`
 * instead of the normal rendered chord symbols; every other bar renders through the real
 * `BarContent`, wrapped in a `Pressable` only so tapping it activates that bar.
 *
 * **The custom chord keyboard, not the OS keyboard, drives typing** — `ChordKeyboard` (A-G, 0-9,
 * the ten quality-symbol keys) is the *only* way text reaches the active bar's field under normal
 * use: the `TextInput` sets `showSoftInputOnFocus={false}` (the documented RN prop for exactly
 * this — stay focused/editable/cursor-visible without ever bringing up the system keyboard) and
 * tracks its own cursor position via the controlled `selection` prop + `onSelectionChange`, so
 * `ChordKeyboard`'s `onKey`/`onBackspace` can insert/delete at exactly the right spot — the same
 * "caller owns the field, keyboard just fires callbacks" contract `ChordKeyboard.tsx`'s own doc
 * comment describes. `onChangeText` is still wired through too (as a safety net for paste, and so
 * this screen's own browser-based verification — a physical/virtual keyboard still reaches a
 * react-native-web `TextInput` regardless of `showSoftInputOnFocus`, which is a native-only
 * restriction — can type into it directly).
 *
 * Deliberately scoped down from web in two places, both documented at the point they diverge:
 * a section name is typed in the Bar toolbar via the normal OS keyboard (a plain word, not chord
 * shorthand) rather than inline on the chart's own badge — the live chart still shows the typed
 * name immediately either way, since `toRealBar` feeds it through the same `bar.section` the
 * normal badge already renders; and the Bar toolbar's repeat/coda/section toggles are plain
 * labeled pills rather than web's glyph-previewing buttons, to keep this file's own scope focused
 * on the keyboard and the editor-is-the-chart rendering fidelity the task specifically called out.
 */
export default function ChordChartEditorScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { importSongs } = useChordChartsLibrary(null);

  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [style, setStyle] = useState('');
  const [key, setKey] = useState('');
  const [top, setTop] = useState(4);
  const [bottom, setBottom] = useState(4);
  const [bars, setBars] = useState<EditableBar[]>(() => Array.from({ length: STARTING_BARS }, blankBar));

  const [activeIndex, setActiveIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [editingSection, setEditingSection] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const skipNextSelectionRef = useRef(false);

  const song: IRealSong = {
    title: title.trim(),
    composer: composer.trim(),
    style: style.trim(),
    key: key.trim(),
    timeSignature: { top, bottom },
    bars: bars.map(toRealBar),
  };

  function updateBar(index: number, patch: Partial<EditableBar>) {
    setBars((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function activateBar(index: number) {
    setActiveIndex(index);
    setEditingSection(false);
    const len = bars[index]?.text.length ?? 0;
    skipNextSelectionRef.current = true;
    setSelection({ start: len, end: len });
  }

  function addBar() {
    const newIndex = bars.length;
    setBars((prev) => [...prev, blankBar()]);
    activateBar(newIndex);
  }

  function nextBar() {
    if (activeIndex === bars.length - 1) addBar();
    else activateBar(activeIndex + 1);
  }

  function removeBar(index: number) {
    if (bars.length <= 1) return;
    const next = bars.filter((_, i) => i !== index);
    setBars(next);
    const newActive = index < activeIndex ? Math.min(activeIndex - 1, next.length - 1) : Math.min(activeIndex, next.length - 1);
    setActiveIndex(newActive);
  }

  /** Insert/delete at the active bar's current cursor position — what `ChordKeyboard`'s
      `onKey`/`onBackspace` actually call. Same logic `ChordSymbolKeypad.tsx`'s `insertSymbol`
      uses on web, just also owning the cursor position itself (there's no OS keyboard driving it
      here). */
  function insertAtCursor(text: string) {
    const current = bars[activeIndex]?.text ?? '';
    const { start, end } = selection;
    const next = current.slice(0, start) + text + current.slice(end);
    updateBar(activeIndex, { text: next });
    const pos = start + text.length;
    skipNextSelectionRef.current = true;
    setSelection({ start: pos, end: pos });
  }

  function backspace() {
    const current = bars[activeIndex]?.text ?? '';
    const { start, end } = selection;
    if (start !== end) {
      updateBar(activeIndex, { text: current.slice(0, start) + current.slice(end) });
      skipNextSelectionRef.current = true;
      setSelection({ start, end: start });
      return;
    }
    if (start <= 0) return;
    updateBar(activeIndex, { text: current.slice(0, start - 1) + current.slice(start) });
    skipNextSelectionRef.current = true;
    setSelection({ start: start - 1, end: start - 1 });
  }

  async function handleSave() {
    if (!song.title) {
      setError('Give this chord chart a title.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await importSongs([song], song.title);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that chord chart.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (!song.title) {
      setError('Give this chord chart a title first.');
      return;
    }
    setError(null);
    setCopied(false);
    setExported(encodeChartString({ name: song.title, songs: [song] }));
  }

  async function handleCopy() {
    if (!exported) return;
    try {
      await Clipboard.setStringAsync(exported);
      setCopied(true);
    } catch {
      // clipboard unavailable — the text is still visible/selectable in the field below.
    }
  }

  const realBars = bars.map(toRealBar);
  const rows = groupRows(realBars, BARS_PER_ROW);
  const rowsWithOffsets = rows.reduce<{ rowBars: Bar[]; start: number }[]>((acc, rowBars) => {
    const prev = acc[acc.length - 1];
    const start = prev ? prev.start + prev.rowBars.length : 0;
    return [...acc, { rowBars, start }];
  }, []);
  const lastRow = rowsWithOffsets[rowsWithOffsets.length - 1];
  const addButtonFitsInGrid = lastRow !== undefined && lastRow.rowBars.length < BARS_PER_ROW;

  const activeBar = bars[activeIndex];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'New chart' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="Tune name" autoFocus />
            <Field label="Composer" value={composer} onChangeText={setComposer} placeholder="Optional" />
            <Field label="Style" value={style} onChangeText={setStyle} placeholder="e.g. Medium Swing" />
            <Field label="Key" value={key} onChangeText={setKey} placeholder="e.g. Bb" />
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <NumberStepper label="Beats per bar" value={top} unit="" min={1} max={32} step={1} onChange={setTop} />
              </View>
              <View className="flex-1">
                <NumberStepper label="Beat unit" value={bottom} unit="" min={1} max={32} step={1} onChange={setBottom} />
              </View>
            </View>
          </View>

          <Text className="font-inter text-xs leading-5" style={{ color: colors.muted }}>
            Tap a bar, then use the keyboard below to type its chords — C^7, F-7, Bb7#5/D, NC for no
            chord, or two chords separated by a space. Tap &ldquo;Next bar&rdquo; to move on.
          </Text>

          <PageFit>
            {rowsWithOffsets.map(({ rowBars, start }, rowIdx) => {
              const isLastRow = rowIdx === rowsWithOffsets.length - 1;
              return (
                <Row
                  key={rowIdx}
                  bars={rowBars}
                  barsPerRow={BARS_PER_ROW}
                  isFirstRow={rowIdx === 0}
                  isLastRow={isLastRow}
                  timeSignature={rowIdx === 0 ? { top, bottom } : undefined}
                  renderBarContent={(bar, i) => {
                    const globalIndex = start + i;
                    if (globalIndex === activeIndex) {
                      return (
                        <TextInput
                          value={bars[globalIndex].text}
                          onChangeText={(t) => updateBar(globalIndex, { text: t })}
                          selection={selection}
                          onSelectionChange={(e) => {
                            if (skipNextSelectionRef.current) {
                              skipNextSelectionRef.current = false;
                              return;
                            }
                            setSelection(e.nativeEvent.selection);
                          }}
                          showSoftInputOnFocus={false}
                          placeholder={bars[globalIndex].isRepeatBar ? '% (ignored)' : 'C^7'}
                          placeholderTextColor={colors.muted}
                          style={{
                            width: COL_WIDTH - 4,
                            height: BAR_HEIGHT,
                            textAlign: 'center',
                            fontFamily: 'PetalumaScript',
                            fontSize: QUALITY_SIZE,
                            color: colors.foreground,
                            opacity: bars[globalIndex].isRepeatBar ? 0.4 : 1,
                          }}
                        />
                      );
                    }
                    return (
                      <Pressable
                        onPress={() => activateBar(globalIndex)}
                        style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <BarContent bar={bar} />
                      </Pressable>
                    );
                  }}
                  trailing={
                    isLastRow && addButtonFitsInGrid ? <AddBarButton onPress={addBar} /> : undefined
                  }
                />
              );
            })}
          </PageFit>
          {!addButtonFitsInGrid ? (
            <Pressable onPress={addBar} className="flex-row items-center gap-1.5 self-start rounded-lg px-2 py-1.5">
              <PlusIcon color={colors.muted} size={16} />
              <Text className="font-inter text-sm" style={{ color: colors.muted }}>
                Add bar
              </Text>
            </Pressable>
          ) : null}

          {activeBar ? (
            <View className="gap-3 rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
              <View className="flex-row items-center justify-between">
                <Text className="font-inter-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                  Bar {activeIndex + 1}
                </Text>
                <Pressable onPress={() => removeBar(activeIndex)} disabled={bars.length <= 1} className="flex-row items-center gap-1 rounded-lg px-2 py-1" style={{ opacity: bars.length <= 1 ? 0.3 : 1 }}>
                  <TrashIcon color={colors.muted} size={14} />
                  <Text className="font-inter text-xs" style={{ color: colors.muted }}>
                    Remove bar
                  </Text>
                </Pressable>
              </View>

              <View className="flex-row flex-wrap gap-2">
                {activeBar.hasSection ? (
                  <Toggle
                    label="Remove section"
                    active
                    onPress={() => {
                      updateBar(activeIndex, { hasSection: false, section: '' });
                      setEditingSection(false);
                    }}
                  />
                ) : (
                  <Toggle
                    label="Add section"
                    active={false}
                    onPress={() => {
                      updateBar(activeIndex, { hasSection: true });
                      setEditingSection(true);
                    }}
                  />
                )}
                <Toggle
                  label="Start repeat"
                  active={activeBar.startRepeat}
                  onPress={() => updateBar(activeIndex, { startRepeat: !activeBar.startRepeat })}
                />
                <Toggle
                  label="End repeat"
                  active={activeBar.endRepeat}
                  onPress={() => updateBar(activeIndex, { endRepeat: !activeBar.endRepeat })}
                />
                <Toggle label="Coda" active={activeBar.coda} onPress={() => updateBar(activeIndex, { coda: !activeBar.coda })} />
                <Toggle
                  label="Repeat bar (%)"
                  active={activeBar.isRepeatBar}
                  onPress={() => updateBar(activeIndex, { isRepeatBar: !activeBar.isRepeatBar })}
                />
              </View>

              {activeBar.hasSection && editingSection ? (
                <Field
                  label="Section name"
                  value={activeBar.section}
                  onChangeText={(t) => updateBar(activeIndex, { section: t })}
                  placeholder="Intro"
                  autoFocus
                />
              ) : null}

              <ChordKeyboard onKey={insertAtCursor} onBackspace={backspace} />

              <Pressable onPress={nextBar} className="items-center rounded-xl py-2.5" style={{ backgroundColor: colors.accent }}>
                <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                  Next bar
                </Text>
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <Text className="font-inter text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}

          {exported ? (
            <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
              <View className="flex-row items-center justify-between">
                <Text className="font-inter-semibold text-xs" style={{ color: colors.muted }}>
                  Chart link
                </Text>
                <Pressable onPress={() => void handleCopy()} className="rounded-lg px-3 py-1" style={{ backgroundColor: colors.background }}>
                  <Text className="font-inter-semibold text-xs" style={{ color: colors.foreground }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </Pressable>
              </View>
              <TextInput
                value={exported}
                editable={false}
                multiline
                style={{ fontFamily: 'PetalumaScript', fontSize: 11, color: colors.muted, backgroundColor: colors.background, borderRadius: 8, padding: 8 }}
              />
            </View>
          ) : null}

          <View className="flex-row justify-end gap-2 border-t pt-4" style={{ borderTopColor: colors.surface }}>
            <Pressable onPress={handleExport} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.surface }}>
              <Text className="font-inter-semibold text-sm" style={{ color: colors.foreground }}>
                Export as chart link
              </Text>
            </Pressable>
            <Pressable onPress={() => void handleSave()} disabled={saving} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.accent, opacity: saving ? 0.5 : 1 }}>
              <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                {saving ? 'Saving…' : 'Save to library'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AddBarButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={{ width: COL_WIDTH, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <PlusIcon color={colors.muted} size={20} />
    </Pressable>
  );
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-lg px-3 py-1.5"
      style={{ backgroundColor: active ? colors.accent : colors.background }}
    >
      <Text
        className="font-inter-semibold text-xs"
        style={{ color: active ? colors['accent-foreground'] : colors.muted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1">
      <Text className="font-inter-semibold text-xs" style={{ color: colors.muted }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus={autoFocus}
        className="font-inter"
        style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }}
      />
    </View>
  );
}
