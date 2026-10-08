import { SecurityTab } from '@/components/account/SecurityTab';
import { AccountSectionPage } from '@/components/account/AccountSectionPage';
import { withScreenLoader } from '@/components/ScreenLoader';

/** "Security" — one section of the account, opened from the Profile list as its own page. */
function SecurityScreen() {
  return (
    <AccountSectionPage
      title="Security"
    >
      <SecurityTab />
    </AccountSectionPage>
  );
}

export default withScreenLoader(SecurityScreen);
