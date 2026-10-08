import ChartEditorPage from "@/components/library/ChartEditorPage";

export default async function NewChartRoute({ searchParams }: { searchParams: Promise<{ playlist?: string }> }) {
  const { playlist } = await searchParams;
  return <ChartEditorPage playlist={playlist} />;
}
