"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import FollowLists from "@/components/FollowLists";
import LoadingSpinner from "@/components/LoadingSpinner";
import PublicProfileEditor from "@/components/PublicProfileEditor";
import SidebarNavButton from "@/components/SidebarNavButton";
import TunesTab from "@/components/TunesTab";
import TunesToLearnTab from "@/components/TunesToLearnTab";
import {
  BookIcon,
  GoogleIcon,
  ListIcon,
  LogOutIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from "@/components/tools";

/** `wide` widens the page to fit the Profile/Security/Danger zone sidebar layout (the signed-in
    view below); the loading and not-signed-in states stay at the original narrower width, since
    neither has anything to put a sidebar next to. */
function PageShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16 ${
        wide ? "max-w-3xl" : "max-w-md"
      }`}
    >
      {children}
    </main>
  );
}

type AccountView = "profile" | "tunes" | "tunesToLearn" | "following" | "security" | "danger";

/** Turns a thrown Error into UI text — Convex actions surface a real message (e.g. our own
    "Enter your password to confirm."), but a wrong password comes back as a long, internal-
    looking Convex/Auth.js error, so anything that doesn't look like a short, deliberate message
    gets replaced with a plain one instead of leaking implementation detail. */
function friendlyError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message && err.message.length < 150 ? err.message : fallback;
}

/** Change password (accounts that already have one) or set one for the first time (a Google-only
    account adding a password so it can also sign in with email+password from then on) — same
    section, different verification underneath depending on `hasPassword`, but both now go
    through an emailed confirmation code before actually taking effect: step 1
    (`requestPasswordConfirmation`) verifies the current password if there is one and emails a
    code; step 2 (`confirmPassword`) takes that code plus the new password — which has been
    sitting in this component's own state the whole time, never sent anywhere in step 1 — and
    actually applies it. */
function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string | null }) {
  const requestConfirmation = useAction(api.account.requestPasswordConfirmation);
  const confirmPassword = useAction(api.account.confirmPassword);
  const [step, setStep] = useState<"form" | "code">("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep("form");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setCode("");
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await requestConfirmation(hasPassword ? { currentPassword } : {});
      setStep("code");
    } catch (err) {
      setError(
        friendlyError(
          err,
          hasPassword ? "Couldn't verify your current password." : "Couldn't send a code.",
        ),
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
      await confirmPassword({ code, newPassword });
      reset();
      setSuccess(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 text-left">
      <div>
        <h2 className="text-lg font-semibold">
          {hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="text-sm text-muted">
          {step === "code"
            ? `Enter the code we emailed to ${email ?? "your email"} to finish.`
            : hasPassword
              ? "Changing your password signs you out on every other device. We'll email a code to confirm it's really you."
              : `Lets you also sign in with ${email ?? "your email"} and a password, not just Google. We'll email a code to confirm.`}
        </p>
      </div>

      {step === "form" ? (
        <form onSubmit={onSubmitForm} className="flex flex-col gap-3">
          {hasPassword && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Current password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">New password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Confirm new password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          {success && (
            <p className="text-sm text-accent">
              {hasPassword ? "Password changed." : "Password set — you can now sign in with it too."}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {hasPassword ? "Send confirmation code" : "Send code to set password"}
          </button>
        </form>
      ) : (
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !code}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {hasPassword ? "Confirm password change" : "Confirm and set password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Session-storage marker key for the "did Connect Google actually land on the same account"
    check — see the comment on `useGoogleLinkWarning` for why this needs a best-effort check at
    all instead of just trusting the redirect. */
const LINK_CHECK_KEY = "jam-practice-google-link-check";

/** After "Connect Google" redirects out to Google and back, this reports whether the Google
    account that came back actually landed on the *same* account (Convex Auth links by matching
    verified email — see `convex/account.ts`'s `setPassword` for the same mechanism from the other
    direction). If someone connects a Google account with a different email, Convex Auth doesn't
    error — it just signs into (or creates) a *different* account instead, which would otherwise
    be a silently confusing account switch. Records the email right before redirecting to Google;
    the *next* mount (a fresh page load once Google redirects back) reads it once via this lazy
    `useState` initializer, then derives the warning as a plain value compared against whoever's
    actually signed in — the effect below only clears the marker (a real side effect against
    sessionStorage), it never calls setState itself, so there's no render-cascading setState-in-
    effect for the same reason the "derive state during render, don't setState from an effect"
    rule exists. */
function useGoogleLinkWarning(userEmail: string | null | undefined) {
  const [pendingCheck] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(LINK_CHECK_KEY);
    } catch {
      return null;
    }
  });
  const [dismissed, setDismissed] = useState(false);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!pendingCheck || clearedRef.current || userEmail === undefined) return;
    clearedRef.current = true;
    try {
      sessionStorage.removeItem(LINK_CHECK_KEY);
    } catch {
      // ignore
    }
  }, [pendingCheck, userEmail]);

  const warning =
    !dismissed && pendingCheck && userEmail !== undefined && userEmail !== pendingCheck
      ? `That Google account uses a different email (${userEmail ?? "none"}) than this account (${pendingCheck}), so it signed in as a separate account instead of connecting to this one. To link Google here, use a Google account with the same email address as this account.`
      : null;

  function markPending() {
    if (!userEmail) return;
    try {
      sessionStorage.setItem(LINK_CHECK_KEY, userEmail);
    } catch {
      // ignore
    }
  }

  return { warning, dismissWarning: () => setDismissed(true), markPending };
}

function SignInMethodsSection({
  hasPassword,
  hasGoogle,
  userEmail,
}: {
  hasPassword: boolean;
  hasGoogle: boolean;
  userEmail: string | null | undefined;
}) {
  const { signIn } = useAuthActions();
  const disconnectGoogle = useAction(api.account.disconnectGoogle);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { warning, dismissWarning, markPending } = useGoogleLinkWarning(userEmail);

  async function onConnect() {
    setError(null);
    markPending();
    try {
      // Redirects the page; only resolves-without-navigating on a real failure.
      await signIn("google");
    } catch {
      setError("Couldn't start connecting Google.");
    }
  }

  async function onDisconnect() {
    setError(null);
    setSubmitting(true);
    try {
      await disconnectGoogle();
    } catch (err) {
      setError(friendlyError(err, "Couldn't disconnect Google."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 text-left">
      <div>
        <h2 className="text-lg font-semibold">Sign-in methods</h2>
        <p className="text-sm text-muted">
          {hasGoogle
            ? "Google is connected to this account."
            : "Connect a Google account so you can also sign in with it."}
        </p>
      </div>

      {warning && (
        <div className="flex flex-col gap-1 rounded-lg bg-background p-3 text-xs text-muted">
          <p>{warning}</p>
          <button
            type="button"
            onClick={dismissWarning}
            className="self-start font-medium text-foreground hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {hasGoogle ? (
        <>
          {!hasPassword && (
            <p className="text-xs text-muted">
              Set a password above before disconnecting Google, so you don&apos;t lose access to
              your account.
            </p>
          )}
          <button
            type="button"
            onClick={() => void onDisconnect()}
            disabled={!hasPassword || submitting}
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
          >
            <GoogleIcon className="h-4 w-4" />
            Disconnect Google
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Only links automatically if the Google account uses the same email address as this
            account{userEmail ? ` (${userEmail})` : ""} — a different Google account signs into a
            separate account instead.
          </p>
          <button
            type="button"
            onClick={() => void onConnect()}
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            <GoogleIcon className="h-4 w-4" />
            Connect Google
          </button>
        </>
      )}
    </section>
  );
}

/** Password accounts go through an emailed confirmation code (`requestDeleteConfirmation` then
    `confirmDelete`) before anything is actually deleted; a Google-only account skips straight to
    deleting once "DELETE" is typed — the explicitly requested exception, since there's no
    password to gate a confirmation email behind and the typed confirmation is considered enough
    friction on its own for that case (`deleteAccount`, unchanged from before). */
function DeleteAccountModal({
  requiresPassword,
  email,
  onClose,
}: {
  requiresPassword: boolean;
  email: string | null;
  onClose: () => void;
}) {
  const requestConfirmation = useAction(api.account.requestDeleteConfirmation);
  const confirmDelete = useAction(api.account.confirmDelete);
  const deleteAccount = useAction(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function finish() {
    // The account's rows are already gone server-side at this point; sign out just clears this
    // device's cached token so the UI actually reflects that.
    await signOut();
    router.push("/");
  }

  async function onConfirmForm() {
    setError(null);
    setSubmitting(true);
    try {
      if (requiresPassword) {
        await requestConfirmation({ password });
        setStep("code");
      } else {
        await deleteAccount({});
        await finish();
      }
    } catch (err) {
      setError(
        friendlyError(
          err,
          requiresPassword
            ? "Couldn't verify your password."
            : "Couldn't delete your account.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmCode() {
    setError(null);
    setSubmitting(true);
    try {
      await confirmDelete({ code });
      await finish();
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
      setSubmitting(false);
    }
  }

  const canSubmitForm = requiresPassword
    ? password.length > 0
    : confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-label="Delete account"
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Delete your account</h2>
          <p className="text-sm text-muted">
            {step === "code"
              ? `Enter the code we emailed to ${email ?? "your email"} to finish.`
              : "This permanently deletes your account and signs you out everywhere. It doesn't touch anything already saved on this device."}
          </p>
        </div>

        {step === "form" ? (
          requiresPassword ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Enter your password to confirm</span>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">
                Type <span className="font-semibold text-foreground">DELETE</span> to confirm
              </span>
              <input
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          )
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Confirmation code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          {step === "form" ? (
            <button
              type="button"
              onClick={() => void onConfirmForm()}
              disabled={!canSubmitForm || submitting}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {requiresPassword ? "Send confirmation code" : "Delete my account"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onConfirmCode()}
              disabled={!code || submitting}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              Delete my account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The signed-in account page — reachable via the account button in Sidebar once signed in.
    Password (change, or set one for the first time), sign-in methods (connect/disconnect
    Google), and delete account. No "forgot password" flow here on purpose — that needs an
    email-sending provider that isn't wired up yet. No route protection: like every other page in
    this app, this one is reachable logged out too, and just shows a plain "not signed in" state
    instead of hard-redirecting. */
export default function AccountPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const providers = useQuery(api.account.linkedProviders);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [view, setView] = useState<AccountView>("profile");

  if (isLoading) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <div className="flex flex-col gap-1 text-left">
          <h1 className="text-2xl font-bold text-accent">Account</h1>
          <p className="text-sm text-muted">
            You&apos;re not signed in — use the account button in the sidebar to sign in first.
          </p>
        </div>
      </PageShell>
    );
  }

  const hasPassword = providers?.includes("password") ?? false;
  const hasGoogle = providers?.includes("google") ?? false;

  function handleSignOut() {
    void signOut();
    router.push("/");
  }

  return (
    <PageShell wide>
      <div className="flex flex-col gap-1 text-left">
        <h1 className="text-2xl font-bold text-accent">Account</h1>
        <p className="text-sm text-muted">{user?.email ?? user?.name ?? "Signed in"}</p>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <nav className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-2 sm:w-48 sm:shrink-0">
          <SidebarNavButton
            active={view === "profile"}
            icon={UserIcon}
            label="Profile"
            onClick={() => setView("profile")}
          />
          <SidebarNavButton
            active={view === "tunes"}
            icon={ListIcon}
            label="Tunes"
            onClick={() => setView("tunes")}
          />
          <SidebarNavButton
            active={view === "tunesToLearn"}
            icon={BookIcon}
            label="Tunes to Learn"
            onClick={() => setView("tunesToLearn")}
          />
          <SidebarNavButton
            active={view === "following"}
            icon={UsersIcon}
            label="Following"
            onClick={() => setView("following")}
          />
          <SidebarNavButton
            active={view === "security"}
            icon={ShieldIcon}
            label="Security"
            onClick={() => setView("security")}
          />
          <SidebarNavButton
            active={view === "danger"}
            icon={TrashIcon}
            label="Danger zone"
            danger
            onClick={() => setView("danger")}
          />
          <div className="my-1 border-t border-background" />
          <SidebarNavButton icon={LogOutIcon} label="Sign out" onClick={handleSignOut} />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {view === "profile" && (
            <>
              <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 text-left">
                <h2 className="text-lg font-semibold">Profile</h2>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted">Email</span>
                    <span className="font-medium">{user?.email ?? "—"}</span>
                  </div>
                  {user?.name && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted">Name</span>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted">Signed in with</span>
                    <div className="flex flex-wrap gap-2">
                      {hasPassword && (
                        <span className="rounded-full bg-background px-3 py-1 text-xs font-medium">
                          Password
                        </span>
                      )}
                      {hasGoogle && (
                        <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs font-medium">
                          <GoogleIcon className="h-3.5 w-3.5" />
                          Google
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              <PublicProfileEditor />
            </>
          )}

          {view === "tunes" && <TunesTab />}

          {view === "tunesToLearn" && <TunesToLearnTab />}

          {view === "following" && <FollowLists />}

          {view === "security" && (
            <>
              <PasswordSection hasPassword={hasPassword} email={user?.email ?? null} />
              <SignInMethodsSection
                hasPassword={hasPassword}
                hasGoogle={hasGoogle}
                userEmail={user === undefined ? undefined : (user?.email ?? null)}
              />
            </>
          )}

          {view === "danger" && (
            <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 text-left ring-1 ring-danger/30">
              <div>
                <h2 className="text-lg font-semibold text-danger">Danger zone</h2>
                <p className="text-sm text-muted">
                  Permanently delete your account. This can&apos;t be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="self-start rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
              >
                Delete my account
              </button>
            </section>
          )}
        </div>
      </div>

      {deleteOpen && (
        <DeleteAccountModal
          requiresPassword={hasPassword}
          email={user?.email ?? null}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </PageShell>
  );
}
