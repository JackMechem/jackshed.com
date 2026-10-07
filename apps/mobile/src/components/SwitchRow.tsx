import { Switch, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/** The native sibling of `apps/web/components/SwitchRow.tsx` — a labeled row around RN's own
    native `Switch` (the same component `app/tool/metronome.tsx`'s "Use a structure" toggle
    already uses inline) rather than a hand-built track/thumb pair, since RN already ships a real
    native switch control. `hint`, unlike web's own always-rendered-when-passed version, is simply
    always shown here — mobile hasn't ported the "?" hint-toggle convention
    (`lib/hints.ts`/`HintsContext`) any of its option panels use yet, so there's no toggle for this
    one row to plug into. */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-semibold font-inter-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
        <Switch
          value={checked}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: colors.background, true: colors.accent }}
        />
      </View>
      {hint ? (
        <Text className="text-xs leading-4 font-inter" style={{ color: colors.muted }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
