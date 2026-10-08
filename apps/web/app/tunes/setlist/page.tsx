import SetlistPage from "@/components/library/SetlistPage";

/** `/tunes/setlist?id=` — one of your setlists. */
export default async function SetlistRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <SetlistPage id={id ?? ""} />;
}
