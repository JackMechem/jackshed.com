import { redirect } from "next/navigation";

/** Old address of a tune's page — it lives under `/tunes` now. */
export default async function OldTuneRoute({ searchParams }: { searchParams: Promise<{ id?: string; list?: string }> }) {
  const { id = "", list = "tunes" } = await searchParams;
  redirect(`/tunes/tune?list=${encodeURIComponent(list)}&id=${encodeURIComponent(id)}`);
}
