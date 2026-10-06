import { Email } from "@convex-dev/auth/providers/Email";
import { generateOtp, sendEmail } from "./lib/resend";

/** The email provider passed to `Password({ verify: ResendOTP })` in `convex/auth.ts` — enables
    "require a confirmation email for creating accounts" (sheddex's own words for it). Convex
    Auth's `Password` provider already handles everything about *when* to trigger this (a fresh
    sign-up, or any account whose `emailVerified` isn't set yet) and the underlying code
    storage/expiry/one-time-use machinery (`authVerificationCodes`, already in the schema via
    `authTables`) — this file only supplies the two provider-specific pieces: what the code looks
    like, and how it's actually sent. */
export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 15, // 15 minutes
  // A short numeric code instead of Convex Auth's 32-character default token — meant to be typed
  // by hand, not clicked as a link.
  async generateVerificationToken() {
    return generateOtp();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    await sendEmail({
      to: email,
      subject: "Verify your sheddex email",
      text: `Your verification code is ${token}\n\nIt expires in 15 minutes. If you didn't try to create a sheddex account, you can ignore this email.`,
    });
  },
});
