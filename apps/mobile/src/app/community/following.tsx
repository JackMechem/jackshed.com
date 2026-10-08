import { ScrollView } from 'react-native';

import { FollowLists } from '@/components/community/FollowLists';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { withScreenLoader } from '@/components/ScreenLoader';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Who you follow and who follows you — opened from Community's "Following" card. */
function FollowingScreen() {
  const { colors } = useAppTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: TAB_BAR_CONTENT_HEIGHT + 24 }}>
      <FollowLists />
    </ScrollView>
  );
}

export default withScreenLoader(FollowingScreen);
