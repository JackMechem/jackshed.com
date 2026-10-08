import { ProfileTab } from '@/components/account/ProfileTab';
import { AccountSectionPage } from '@/components/account/AccountSectionPage';
import { withScreenLoader } from '@/components/ScreenLoader';

/** "Public profile" — one section of the account, opened from the Profile list as its own page. */
function PublicProfileScreen() {
  return (
    <AccountSectionPage
      title="Public profile"
      info={'An optional public page other people can find and follow. Nothing here is visible to anyone until you turn on "Make profile public".'}
    >
      <ProfileTab />
    </AccountSectionPage>
  );
}

export default withScreenLoader(PublicProfileScreen);
