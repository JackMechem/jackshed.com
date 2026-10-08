import { DangerZoneTab } from '@/components/account/DangerZoneTab';
import { AccountSectionPage } from '@/components/account/AccountSectionPage';
import { withScreenLoader } from '@/components/ScreenLoader';

/** "Delete account" — one section of the account, opened from the Profile list as its own page. */
function DeleteAccountScreen() {
  return (
    <AccountSectionPage
      title="Delete account"
    >
      <DangerZoneTab />
    </AccountSectionPage>
  );
}

export default withScreenLoader(DeleteAccountScreen);
