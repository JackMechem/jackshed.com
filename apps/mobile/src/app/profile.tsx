import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DangerZoneTab } from '@/components/account/DangerZoneTab';
import { MyPostsTab } from '@/components/account/MyPostsTab';
import { ProfileTab } from '@/components/account/ProfileTab';
import { SecurityTab } from '@/components/account/SecurityTab';
import { TunesTab } from '@/components/account/TunesTab';
import { TunesToLearnTab } from '@/components/account/TunesToLearnTab';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The native side of `apps/web/components/AccountMenu.tsx`'s `AuthForm` (signed out) plus
 * `apps/web/components/AccountPage.tsx` (signed in) — same backend throughout, same
 * `@convex-dev/auth` password+email-verification state machine for both signing up and the
 * account-management flows. Signed in, a horizontal pill tab bar (the same "pool of choices"
 * convention this app's option pickers already use elsewhere) switches between six sections
 * mirroring web's own sidebar nav: Profile / Tunes / Tunes to Learn / Posts / Security / Danger
 * zone — one full screen instead of web's fixed sidebar, since there's no room for both side by
 * side here.
 *
 * **Deliberately not ported, both real, documented gaps, not forgotten corners**: web's own
 * "Following" tab (`FollowLists`) — there's no way to follow anyone yet without a Community
 * search/public-profile-viewing screen, neither of which exist on mobile yet, so an empty
 * Following list here would have nothing real to show; and Google sign-in connect/disconnect in
 * Security — Google itself isn't wired up on mobile at all yet (needs an in-app-browser +
 * deep-link redirect handshake, a separate, unstarted task), so there's nothing for those buttons
 * to actually do.
 */
export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="items-center px-5 pb-4 pt-6">
          <Text className="text-2xl font-extrabold font-inter-extrabold" style={{ color: colors.foreground }}>
            Profile
          </Text>
        </View>
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : isAuthenticated ? (
          <SignedIn />
        ) : (
          <AuthForm />
        )}
      </SafeAreaView>
    </View>
  );
}

type AccountView = 'profile' | 'tunes' | 'tunesToLearn' | 'posts' | 'security' | 'danger';

const TABS: { key: AccountView; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'tunes', label: 'Tunes' },
  { key: 'tunesToLearn', label: 'Learn' },
  { key: 'posts', label: 'Posts' },
  { key: 'security', label: 'Security' },
  { key: 'danger', label: 'Danger' },
];

function SignedIn() {
  const { colors } = useAppTheme();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<AccountView>('profile');

  const label = profile?.username ? `@${profile.username}` : (user?.name ?? user?.email ?? '');

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-3">
        <UserAvatar url={profile?.avatarUrl} size="sm" />
        <Text className="flex-1 text-sm font-semibold font-inter-semibold" numberOfLines={1} style={{ color: colors.foreground }}>
          {label}
        </Text>
        <Pressable
          onPress={() => {
            setSigningOut(true);
            void signOut();
          }}
          disabled={signingOut}
          className="rounded-xl px-3 py-1.5"
          style={{ backgroundColor: colors.surface, opacity: signingOut ? 0.6 : 1 }}
        >
          <Text className="text-xs font-semibold font-inter-semibold" style={{ color: colors.danger }}>
            Sign out
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' }}
      >
        {TABS.map((tab) => {
          const active = view === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setView(tab.key)}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: active ? colors.accent : colors.surface }}
            >
              <Text
                className="text-sm font-semibold font-inter-semibold"
                style={{ color: active ? colors['accent-foreground'] : colors.foreground }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: TAB_BAR_CONTENT_HEIGHT + 24, gap: 16 }}
      >
        {view === 'profile' ? <ProfileTab /> : null}
        {view === 'tunes' ? <TunesTab /> : null}
        {view === 'tunesToLearn' ? <TunesToLearnTab /> : null}
        {view === 'posts' ? <MyPostsTab /> : null}
        {view === 'security' ? <SecurityTab /> : null}
        {view === 'danger' ? <DangerZoneTab /> : null}
      </ScrollView>
    </View>
  );
}

type Flow = 'signIn' | 'signUp';
type Step = 'credentials' | 'code';

function AuthForm() {
  const { colors } = useAppTheme();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>('signIn');
  // "code" means Convex Auth's Password provider emailed a confirmation code instead of completing
  // sign-in/sign-up directly — covers both a fresh sign-up and any pre-existing account that's
  // never verified its email. Same state shape as `AccountMenu.tsx`'s own `AuthForm` on web.
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email, password, flow });
      if (!result.signingIn) {
        // Didn't throw, but no tokens came back either — a confirmation code was emailed instead.
        setStep('code');
      }
    } catch {
      setError(
        flow === 'signUp'
          ? "Couldn't create that account — the email may already be in use, or the password may be too short."
          : "Couldn't sign in — check the email and password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email, code, flow: 'email-verification' });
      if (!result.signingIn) {
        setError("That code didn't work — try again.");
      }
    } catch {
      setError('That code is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'code') {
    return (
      <View className="flex-1 px-6 pt-6">
        <Text className="mb-1 text-base font-bold font-inter-bold" style={{ color: colors.foreground }}>
          Check your email
        </Text>
        <Text className="mb-5 text-sm font-inter" style={{ color: colors.muted }}>
          We sent a code to {email}. Enter it below to finish{' '}
          {flow === 'signUp' ? 'creating your account' : 'signing in'}.
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoFocus
          className="mb-4 rounded-2xl px-4 py-3 text-base font-inter"
          style={{ backgroundColor: colors.surface, color: colors.foreground }}
        />
        {error ? (
          <Text className="mb-3 text-sm font-inter" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        <SubmitButton label="Confirm" onPress={onSubmitCode} disabled={submitting || !code} />
        <Pressable onPress={() => setStep('credentials')} className="mt-4 items-center p-2">
          <Text className="text-sm font-inter" style={{ color: colors.muted }}>
            Back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 pt-6">
      <View
        className="mb-5 flex-row self-center rounded-full p-1"
        style={{ backgroundColor: colors.surface }}
      >
        {(['signIn', 'signUp'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              setFlow(f);
              setError(null);
            }}
            className="rounded-full px-5 py-2"
            style={{ backgroundColor: flow === f ? colors.accent : 'transparent' }}
          >
            <Text
              className="text-sm font-bold font-inter-bold"
              style={{ color: flow === f ? colors['accent-foreground'] : colors.muted }}
            >
              {f === 'signIn' ? 'Sign in' : 'Sign up'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1.5 text-xs font-bold font-inter-bold tracking-wide" style={{ color: colors.muted }}>
        EMAIL
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        className="mb-4 rounded-2xl px-4 py-3 text-base font-inter"
        style={{ backgroundColor: colors.surface, color: colors.foreground }}
      />

      <Text className="mb-1.5 text-xs font-bold font-inter-bold tracking-wide" style={{ color: colors.muted }}>
        PASSWORD
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
        className="mb-4 rounded-2xl px-4 py-3 text-base font-inter"
        style={{ backgroundColor: colors.surface, color: colors.foreground }}
      />

      {error ? (
        <Text className="mb-3 text-sm font-inter" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      <SubmitButton
        label={flow === 'signUp' ? 'Create account' : 'Sign in'}
        onPress={onSubmitCredentials}
        disabled={submitting || !email || !password}
      />

      <Text className="mt-6 text-center text-xs leading-5 font-inter" style={{ color: colors.muted }}>
        Signing in with Google isn&apos;t available in the app yet — use email and password, or
        sign in on the web.
      </Text>
    </View>
  );
}

function SubmitButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="items-center rounded-2xl p-4"
      style={{ backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-[15px] font-bold font-inter-bold" style={{ color: colors['accent-foreground'] }}>
        {label}
      </Text>
    </Pressable>
  );
}
