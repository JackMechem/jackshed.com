import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon, ProfileIcon, UsersIcon, type IconProps } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The bottom nav bar for the three primary destinations — Home, Community, Profile. A plain,
 * ordinary bottom bar per a direct follow-up reversing the previous floating-pill redesign: "make
 * it not transparent and not rounded and just full width extending from the bottom of the screen
 * with a light top border" — a solid `colors.surface` fill (no blur at all anymore — `expo-blur`'s
 * `BlurView`/`BlurTargetView` were both dropped outright, not just unused, once nothing needed
 * them; see `_layout.tsx`'s own history for the `BlurTargetView` wrapper this removal also
 * simplified away), square corners, edge-to-edge width, flush against the true bottom of the
 * screen (the device's own safe-area inset is internal `paddingBottom` on the row, not a gap the
 * bar floats above), and a single `borderTopWidth: 1` in the app's usual subtle border color
 * (`colors['surface-hover']`, the same token borders use everywhere else in this app).
 *
 * Still icon-only with no visible label, and the active tab still shown by icon color plus a tiny
 * accent dot rather than a background-fill pill behind it — that part of the earlier "minimal"
 * redesign wasn't what this follow-up asked to change, just the container's own shape/opacity/
 * position. Each tab now gets equal `flex: 1` width across the full bar instead of a fixed small
 * square, since there's a whole bar's width to fill rather than a tight pill to hug.
 *
 * Deliberately a hand-built `View`/`Pressable` row, not `expo-router`'s `Tabs`/native-tabs layout
 * — per the same direct steer as the rest of this redesign ("fully native components tend to look
 * very generic"), and because the single flat `Stack` architecture (not per-tab stacks) doesn't
 * need the heavier restructure a real tab navigator would mean adopting.
 *
 * Mounted once in `_layout.tsx`, as a sibling of `Stack` — persists across navigation rather than
 * remounting per screen.
 */
const TABS = [
  { href: '/' as const, label: 'Home', Icon: HomeIcon },
  { href: '/tool/community' as const, label: 'Community', Icon: UsersIcon },
  { href: '/profile' as const, label: 'Profile', Icon: ProfileIcon },
] satisfies { href: Href; label: string; Icon: (props: IconProps) => React.ReactElement }[];

/** The bar's own content row height, *not* counting the device's safe-area inset below it (the bar
    itself extends flush to the true bottom of the screen, but that extra strip just overlaps the
    inset a `SafeAreaView`-edged screen already excludes from its own content — it doesn't eat into
    anything a screen needs to additionally avoid). Every screen that needs to reserve space for
    this bar (`index.tsx`'s own `ToolGrid`, `metronome.tsx`, `theme.tsx`) imports this instead of
    hand-duplicating the number, so there's exactly one place to update if the bar's own size ever
    changes again. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

export function FloatingTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors['surface-hover'],
      }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Pressable
            key={href}
            onPress={() => router.navigate(href)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            className="flex-1 items-center justify-center"
          >
            <Icon color={active ? colors.accent : colors.muted} size={20} />
            <View
              style={{
                marginTop: 4,
                width: 3,
                height: 3,
                borderRadius: 2,
                backgroundColor: active ? colors.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
