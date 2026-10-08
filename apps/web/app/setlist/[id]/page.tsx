import SharedSetlistPage from "@/components/SharedSetlistPage";

/** `/setlist/<id>` — a setlist shared by link (what the "Share link" button sends out). */
export default async function SharedSetlistRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SharedSetlistPage id={id} />;
}
