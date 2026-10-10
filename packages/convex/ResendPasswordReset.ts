import { Email } from "@convex-dev/auth/providers/Email";
import { sendEmail } from "./lib/resend";

const MAX_AGE_MINUTES = 60;

/** The email provider passed to `Password({ reset: ResendPasswordReset })` in `convex/auth.ts` —
    "forgot password". Convex Auth's `Password` provider owns the flow (`flow: "reset"` sends this,
    `flow: "reset-verification"` with the token + `newPassword` checks it, changes the password,
    signs out other sessions and signs this one in); this file only says what the token is and how
    it's sent.

    Unlike sign-up's 6-digit code (`ResendOTP.ts`), this is a link: a long random token nobody has
    to type, so it can't be guessed. It points at the web app's `/reset-password` page (`SITE_URL`,
    already set for OAuth), as `?token=` rather than `?code=`, because Convex Auth's Next.js
    middleware treats any `?code=` as an OAuth callback and would swallow it. */
export const ResendPasswordReset = Email({
  id: "resend-password-reset",
  maxAge: 60 * MAX_AGE_MINUTES,
  async generateVerificationToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const site = (process.env.SITE_URL ?? "https://sheddex.com").replace(/\/$/, "");
    const url = `${site}/reset-password?${new URLSearchParams({ email, token })}`;
    await sendEmail({
      to: email,
      subject: "Reset your sheddex password",
      text: `Someone (hopefully you) asked to reset the password for your sheddex account.\n\nChoose a new password here:\n${url}\n\nThe link works once and expires in ${MAX_AGE_MINUTES} minutes. If you didn't ask for this, you can ignore this email; your password won't change.`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1e2833">
  <p style="font-size:22px;font-weight:700;margin:0 0 16px">sheddex</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 24px">Someone (hopefully you) asked to reset the password for your sheddex account.</p>
  <a href="${url}" style="display:inline-block;background:#3870b2;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">Reset password</a>
  <p style="font-size:13px;line-height:1.5;color:#5c6878;margin:24px 0 0">The link works once and expires in ${MAX_AGE_MINUTES} minutes. If you didn't ask for this, you can ignore this email; your password won't change.</p>
  <p style="font-size:12px;line-height:1.5;color:#5c6878;margin:16px 0 0;word-break:break-all">Button not working? Paste this into your browser:<br>${url}</p>
</div>`,
    });
  },
});
