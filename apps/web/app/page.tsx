import type { Metadata } from "next";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "sheddex: every practice tool, in one shed",
  description: "Free practice tools for musicians: metronome, tuner, ear training, chord charts, sticking warmups and your tune library. No ads, no paywalls.",
};

/** "/" — the landing page (the app itself starts at `/dashboard`). `?auth=login` / `?auth=signup`
    opens the sign-in modal straight away (the app's "Sign in" links use it). */
export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { auth } = await searchParams;
  // Read on the server so the signed-in buttons show from the first paint, with no flash.
  return <Landing initialSignedIn={await isAuthenticatedNextjs()} initialAuth={auth === "signup" ? "signUp" : auth === "login" ? "signIn" : null} />;
}
