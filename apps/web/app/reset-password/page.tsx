import type { Metadata } from "next";
import ResetPassword from "@/components/ResetPassword";

export const metadata: Metadata = { title: "Reset your password · sheddex" };

/** `/reset-password` — "forgot password". Without `?token=` it asks for your email and sends a
    reset link; the link (from `packages/convex/ResendPasswordReset.ts`) comes back here with
    `?email=&token=` to choose a new password. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <ResetPassword email={one(params.email)} token={one(params.token)} />;
}
