import SetlistChartsPage from "@/components/library/SetlistChartsPage";

/** `/setlist-charts?mine=|post=|shared=<id>[&start=]` — a setlist's charts, one per page. */
export default async function SetlistChartsRoute({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string; post?: string; shared?: string; start?: string }>;
}) {
  const p = await searchParams;
  return <SetlistChartsPage mine={p.mine} post={p.post} shared={p.shared} start={Math.max(0, Number(p.start) || 0)} />;
}
