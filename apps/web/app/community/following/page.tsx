import { CommunitySubPage } from "@/components/Community";
import FollowLists from "@/components/FollowLists";

export default function FollowingRoute() {
  return (
    <CommunitySubPage title="Following">
      <FollowLists />
    </CommunitySubPage>
  );
}
