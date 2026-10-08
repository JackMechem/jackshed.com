import ChartEditorPage from "@/components/library/ChartEditorPage";

export default async function EditChartRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ChartEditorPage editId={id ?? ""} />;
}
