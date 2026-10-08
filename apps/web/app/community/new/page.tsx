import NewPostPage from "@/components/NewPostPage";

/** `/community/new[?setlist=<id>]` — posting to Community. */
export default async function NewPostRoute({ searchParams }: { searchParams: Promise<{ setlist?: string }> }) {
  const { setlist } = await searchParams;
  return <NewPostPage setlistId={setlist} />;
}
