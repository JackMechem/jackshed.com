import { CommunitySubPage } from "@/components/Community";
import LikedPosts from "@/components/LikedPosts";

export default function LikedPostsRoute() {
  return (
    <CommunitySubPage title="Liked posts">
      <LikedPosts />
    </CommunitySubPage>
  );
}
