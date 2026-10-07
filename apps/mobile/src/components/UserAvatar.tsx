import { Image } from 'expo-image';
import { View } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const DIM: Record<Size, number> = { sm: 32, md: 44, lg: 64, xl: 96 };
const ICON_SIZE: Record<Size, number> = { sm: 16, md: 20, lg: 28, xl: 40 };

type Size = 'sm' | 'md' | 'lg' | 'xl';

/** The native sibling of `apps/web/components/UserAvatar.tsx` — a profile picture, or a plain
    fallback icon when there isn't one, reused everywhere an avatar shows (so far: the account
    page's own Profile tab). `expo-image` instead of plain RN `Image` for its own disk/memory
    caching of a remote, Convex-storage-hosted URL — the same reasoning web's own doc comment
    gives for reaching for the platform's own image handling rather than adding ceremony. */
export function UserAvatar({
  url,
  size = 'md',
}: {
  url: string | null | undefined;
  size?: Size;
}) {
  const { colors } = useAppTheme();
  const dim = DIM[size];

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: colors.surface,
        }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ProfileIcon color={colors.muted} size={ICON_SIZE[size]} />
    </View>
  );
}
