import RecordingPage from "@/components/recordings/RecordingPage";

/** `/recordings/view?id=…` — one recording (see `components/recordings/RecordingPage.tsx`). */
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <RecordingPage id={id ?? ""} />;
}
