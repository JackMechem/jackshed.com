import { Pressable, Text, View } from 'react-native';

import { BackspaceIcon } from '@/components/icons';
import { ChordQualityText } from '@/components/ChordQualityText';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A from-scratch on-screen keyboard for typing iReal-style chord shorthand ("C^7", "Bb-7b5/D",
 * "NC") — replaces the OS keyboard entirely rather than supplementing it, per a direct request:
 * phone keyboards are full QWERTY layouts with dozens of keys that mean nothing for a chord
 * symbol, where the *entire* alphabet this notation ever needs is 7 letters, 10 digits, and a
 * handful of quality symbols. A caller pairs this with a `TextInput` that sets
 * `showSoftInputOnFocus={false}` (the real, documented RN prop for exactly this — keep the field
 * focused/editable/cursor-visible without ever bringing up the system keyboard) and feeds this
 * component's `onKey`/`onBackspace` callbacks into its own cursor-aware insert logic, the same
 * "insert at the current cursor position" responsibility `ChordSymbolKeypad.tsx` already puts on
 * its own callers on web.
 *
 * Letters are capped at A-G (no H and above — not a real note letter in any notation this app
 * uses) and digits 0-9 are included even though the request's own wording only named "letters A-G
 * and all the special musical symbols" — every single worked example of chord shorthand anywhere
 * in this app ("C7", "Dm9", "Bb7#5/D", extensions like 11/13) needs digits, so a keyboard that
 * could type a root and a quality symbol but never a "7" would be unable to enter almost any real
 * chord; this reads as an oversight in the request, not a deliberate exclusion, and including
 * digits is what actually makes "make the chart maker usable" true.
 */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
export const SYMBOL_KEYS: { insert: string; caption: string }[] = [
  { insert: '-', caption: 'minor' },
  { insert: '^', caption: 'maj7' },
  { insert: 'o', caption: 'dim' },
  { insert: 'h', caption: 'half-dim' },
  { insert: '+', caption: 'aug' },
  { insert: '#', caption: 'sharp' },
  { insert: 'b', caption: 'flat' },
  { insert: '/', caption: 'bass' },
  { insert: 'sus', caption: 'sus' },
  { insert: 'add', caption: 'add' },
];

export function ChordKeyboard({
  onKey,
  onBackspace,
}: {
  onKey: (text: string) => void;
  onBackspace: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View className="gap-1.5 rounded-2xl p-2" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row gap-1.5">
        {LETTERS.map((letter) => (
          <Key key={letter} flex onPress={() => onKey(letter)}>
            <Text className="text-lg font-bold font-inter-bold" style={{ color: colors.foreground }}>
              {letter}
            </Text>
          </Key>
        ))}
      </View>

      <View className="flex-row gap-1.5">
        {DIGITS.map((digit) => (
          <Key key={digit} flex onPress={() => onKey(digit)}>
            <Text className="text-lg font-bold font-inter-bold tabular-nums" style={{ color: colors.foreground }}>
              {digit}
            </Text>
          </Key>
        ))}
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        {SYMBOL_KEYS.map((key) => (
          <Key key={key.insert} onPress={() => onKey(key.insert)}>
            <ChordQualityText quality={key.insert} style={{ fontSize: 17, color: colors.foreground }} />
            <Text className="text-[10px] font-inter" style={{ color: colors.muted }}>
              {key.caption}
            </Text>
          </Key>
        ))}
        <Key onPress={onBackspace}>
          <BackspaceIcon color={colors.foreground} size={18} />
          <Text className="text-[10px] font-inter" style={{ color: colors.muted }}>
            delete
          </Text>
        </Key>
      </View>
    </View>
  );
}

function Key({
  children,
  onPress,
  flex,
}: {
  children: React.ReactNode;
  onPress: () => void;
  flex?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={`items-center justify-center gap-0.5 rounded-lg py-2 ${flex ? 'flex-1' : ''}`}
      style={{ backgroundColor: colors.background, minWidth: flex ? undefined : 58 }}
    >
      {children}
    </Pressable>
  );
}
