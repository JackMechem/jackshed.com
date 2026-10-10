import type { Metadata } from "next";
import Home from "@/components/Home";

export const metadata: Metadata = { title: "Dashboard · sheddex" };

/** `/dashboard` — the app's home. ("/" is the landing page.) */
export default function DashboardPage() {
  return <Home />;
}
