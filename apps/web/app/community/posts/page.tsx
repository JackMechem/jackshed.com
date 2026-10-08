import { CommunitySubPage } from "@/components/Community";
import MyPostsTab from "@/components/MyPostsTab";

export default function MyPostsRoute() {
  return (
    <CommunitySubPage title="My posts">
      <MyPostsTab />
    </CommunitySubPage>
  );
}
