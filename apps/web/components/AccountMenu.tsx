"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import { GoogleIcon, UserIcon, svgProps } from "@/components/tools";

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/** Same button shape as Sidebar's ThemeButton (collapsed/large props, identical styling) so this
    drops into either sidebar footer without special-casing. */
function buttonClass(collapsed?: boolean, large?: boolean) {
  return `flex w-full items-center gap-3 ${large ? "rounded-2xl" : "rounded-xl"} px-3 font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${
    large ? "py-3 text-base" : "py-2 text-sm"
  } ${collapsed ? "justify-center" : ""}`;
}

function AuthForm({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  // "code" means Convex Auth's Password provider (configured with `verify: ResendOTP` in
  // convex/auth.ts) emailed a confirmation code instead of completing sign-in/sign-up directly —
  // covers both a fresh sign-up and any pre-existing account that's never verified its email.
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("password", { email, password, flow });
      if (result.signingIn) {
        onClose();
      } else {
        // Didn't throw, but no tokens came back either — a confirmation code was emailed
        // instead.
        setStep("code");
      }
    } catch {
      // Convex Auth's own error isn't consistently user-facing across failure modes (wrong
      // password, unknown email, password too short, email already registered on sign-up, ...),
      // so this stays a single honest, generic message per flow rather than guessing at a
      // wrong-but-specific one.
      setError(
        flow === "signUp"
          ? "Couldn't create that account — the email may already be in use, or the password may be too short."
          : "Couldn't sign in — check the email and password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("password", { email, code, flow: "email-verification" });
      if (result.signingIn) {
        onClose();
      } else {
        setError("That code didn't work — try again.");
      }
    } catch {
      setError("That code is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setGoogleSubmitting(true);
    try {
      // Redirects the page on success, so this only ever resolves-without-navigating on a real
      // failure (e.g. Google sign-in isn't configured yet on this deployment).
      await signIn("google");
    } catch {
      setError("Couldn't start Google sign-in.");
      setGoogleSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted">
            Enter the code we sent to {email} to finish{" "}
            {flow === "signUp" ? "creating your account" : "signing in"}.
          </p>
        </div>
        <form onSubmit={onSubmitCode} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Confirmation code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setError(null);
              }}
              className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting || !code}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">
          {flow === "signIn" ? "Sign in" : "Create an account"}
        </h2>
        <p className="text-sm text-muted">
          Sign in to sync your tune list, chord charts and practice stats across devices. Every
          tool still works fine without an account.
        </p>
      </div>

      <form onSubmit={onSubmitCredentials} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Email</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        {flow === "signUp" && (
          <p className="text-xs text-muted">
            By creating an account, you agree to sheddex&apos;s{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setFlow(flow === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email || password.length < 8}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {flow === "signIn" ? "Sign in" : "Sign up"}
            </button>
          </div>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-background" />
        or
        <div className="h-px flex-1 bg-background" />
      </div>

      <button
        type="button"
        onClick={() => void onGoogle()}
        disabled={googleSubmitting}
        className="flex items-center justify-center gap-2 rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
      >
        <GoogleIcon className="h-4 w-4" />
        Continue with Google
      </button>
    </>
  );
}

function SignInModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Sign in"
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthForm onClose={onClose} />
      </div>
    </div>
  );
}

/** The sign-in / account button, mounted in both of Sidebar's footers (desktop and mobile) next
    to ThemeButton. Signed out, it opens a fully custom sign-in modal (email+password with a
    sign-in/sign-up toggle, plus "Continue with Google" — no premade auth widget). Signed in, it's
    just a link to the full `/account` page (password change, delete account, ...). */
export default function AccountMenu({
  collapsed,
  large,
  onNavigate,
}: {
  collapsed?: boolean;
  large?: boolean;
  /** Called when the signed-in link is actually navigated — Sidebar's mobile overlay uses this
      to close itself, same as every other nav link there. */
  onNavigate?: () => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const [signInOpen, setSignInOpen] = useState(false);

  if (isLoading) {
    // Same size/shape either way, so nothing shifts once the real auth state resolves a moment
    // later — just not clickable yet.
    return (
      <span className={buttonClass(collapsed, large)}>
        <UserIcon className={large ? "h-5 w-5 shrink-0" : "h-4 w-4 shrink-0"} />
        {!collapsed && <LoadingSpinner size="sm" inline label="Signing in" />}
      </span>
    );
  }

  if (isAuthenticated) {
    // Until a username is actually set (a brief window — `UsernamePrompt` forces one right after
    // sign-up/sign-in), fall back to email/name, the same label this button always showed.
    const username = profile?.username ? `@${profile.username}` : null;
    const label = username ?? (user?.email ?? user?.name ?? "Account");
    // Once there's a real username, the email (if any) shows as a second, smaller line under it
    // — there's nothing to show twice when `label` already *is* the email (no username yet).
    const email = username && user?.email ? user.email : null;

    if (collapsed) {
      // Not `buttonClass` — no horizontal padding at all (the row's own width comes from the
      // parent flex-col stretching it), and deliberately no `hover:bg-*`/rounded background at
      // all either, per a direct request for the picture itself to be the only thing visible here,
      // with no container showing even on hover — the avatar's own ring (`UserAvatar`'s own
      // `ring-foreground/10`) is the only visual framing it gets.
      return (
        <Link
          href="/account"
          onClick={onNavigate}
          title={email ? `${label} — ${email}` : label}
          className="flex items-center justify-center py-2"
        >
          <UserAvatar url={profile?.avatarUrl ?? null} size="sm" />
        </Link>
      );
    }

    // The avatar/label row is still a plain link to `/account` (least surprise — clicking the row
    // itself does what it always did); the "..." flyout is a sibling, not nested inside it (a
    // button inside an anchor is invalid HTML and breaks click handling), absolutely positioned
    // over padding the row reserves for it, same "star over a nav link" pattern `Sidebar.tsx`'s
    // own `NavItems` already uses.
    return (
      <div className="group relative flex items-center">
        <Link
          href="/account"
          onClick={onNavigate}
          className={`${buttonClass(false, large)} ${large ? "pr-12" : "pr-10"}`}
        >
          <UserAvatar url={profile?.avatarUrl ?? null} size="sm" />
          <span className="flex min-w-0 flex-col items-start">
            <span className="truncate">{label}</span>
            {email && (
              <span className="truncate text-xs font-normal text-muted">{email}</span>
            )}
          </span>
        </Link>
        <Flyout
          icon={DotsIcon}
          label="Account options"
          align="end"
          buttonClassName={`absolute right-1 top-1/2 flex -translate-y-1/2 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${
            large ? "h-9 w-9" : "h-8 w-8"
          }`}
        >
          {(close) => (
            <>
              <FlyoutItem
                icon={UserIcon}
                label="Account settings"
                onSelect={() => {
                  router.push("/account");
                  onNavigate?.();
                  close();
                }}
              />
              <FlyoutItem
                icon={SignOutIcon}
                label="Sign out"
                danger
                onSelect={() => {
                  void signOut();
                  onNavigate?.();
                  close();
                }}
              />
            </>
          )}
        </Flyout>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSignInOpen(true)}
        title={collapsed ? "Sign in" : undefined}
        className={buttonClass(collapsed, large)}
      >
        <UserIcon className={large ? "h-5 w-5 shrink-0" : "h-4 w-4 shrink-0"} />
        {!collapsed && <span className="truncate">Sign in</span>}
      </button>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </>
  );
}
