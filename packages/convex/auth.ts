import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { ResendOTP } from "./ResendOTP";

// Google only actually works once AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are set on the deployment
// (`npx convex env set ...`) and the matching OAuth Client ID's redirect URI is configured in
// Google Cloud Console — see PROJECT.md. Listing it here before that's done is harmless; the
// "Continue with Google" button just won't work until the env vars exist.
//
// `verify: ResendOTP` requires confirming a 6-digit code emailed to the address before a
// password sign-up (or any not-yet-verified account's next sign-in) actually completes — same
// prerequisite as Google: needs AUTH_RESEND_KEY set before it can actually send anything.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ verify: ResendOTP }), Google],
});
