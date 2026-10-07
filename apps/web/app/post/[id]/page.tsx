import PostPage from "@/components/PostPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostPage id={id} />;
}
