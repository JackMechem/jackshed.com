// A thin wrapper around Resend's plain HTTP API (https://resend.com/docs/api-reference/emails/send-email)
// rather than their Node SDK — Convex actions can already `fetch()` external APIs directly, so
// this avoids adding a dependency just to POST one JSON body with a bearer token.

/** Sends a plain-text email via Resend. Throws if the API key isn't set (a clear signal during
    development that `npx convex env set AUTH_RESEND_KEY ...` hasn't been done yet — see
    PROJECT.md) or if Resend itself rejects the request. Both env vars are read here, at call
    time, rather than once at module load — so a `convex env set` takes effect on the very next
    email sent, with no dependency on whether/when this module happens to get reloaded. */
export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    throw new Error(
      "AUTH_RESEND_KEY isn't set on this deployment — run `npx convex env set AUTH_RESEND_KEY <key>` first.",
    );
  }
  const from = process.env.AUTH_EMAIL_FROM ?? "sheddex <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend rejected the email (${response.status}): ${body.slice(0, 300)}`);
  }
}

/** A 6-digit numeric code — short enough to type by hand, unlike Convex Auth's own 32-character
    default verification token. Used both for Convex Auth's built-in sign-up email verification
    (`ResendOTP.ts`) and this app's own delete-account/password-change email confirmations
    (`convex/account.ts`), so both read the same way in an inbox. */
export function generateOtp(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}

/** SHA-256 hex digest — used to store confirmation codes hashed (`convex/account.ts`'s
    `pendingConfirmations` table) rather than in plaintext, via the Web Crypto API Convex actions
    already have access to (no extra dependency). Codes are short-lived (15 minutes) and
    single-use regardless, but there's no reason to keep an active, working code sitting in
    plaintext in the database in the meantime. */
export async function hashCode(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
