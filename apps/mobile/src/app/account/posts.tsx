import { MyPostsTab } from '@/components/account/MyPostsTab';
import { AccountSectionPage } from '@/components/account/AccountSectionPage';
import { withScreenLoader } from '@/components/ScreenLoader';

/** "My posts" — one section of the account, opened from the Profile list as its own page. */
function PostsScreen() {
  return (
    <AccountSectionPage
      title="My posts"
      info={"Everything you've posted to Community. Post something new from Community's + button."}
    >
      <MyPostsTab />
    </AccountSectionPage>
  );
}

export default withScreenLoader(PostsScreen);
