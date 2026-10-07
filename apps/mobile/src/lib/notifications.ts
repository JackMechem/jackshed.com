import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * A small wrapper around `expo-notifications`, built specifically for Practice Timer's own "notify
 * when a segment ends, even if the app is backgrounded or fully closed" requirement — the one
 * thing a plain in-app `setTimeout` genuinely can't do, since a mobile OS throttles or suspends JS
 * timers once the app isn't in the foreground. A *local, OS-scheduled* notification sidesteps this
 * entirely: once scheduled, it's the operating system — not this app's own JS process — that
 * delivers it at the right wall-clock moment, whether the app is foregrounded, backgrounded, or
 * killed outright. That's also why `practiceTimerEngine.ts` only ever needs to schedule *one*
 * notification per step (when it starts, for exactly its own duration from then) rather than
 * re-scheduling on every app resume: the original schedule already represents the real end time
 * and keeps ticking down at the OS level regardless of what this app's own process does meanwhile.
 *
 * `ensureNotificationPermissions()` is safe to call repeatedly — `getPermissionsAsync` is cheap,
 * and `requestPermissionsAsync` itself is a no-op if permission was already decided one way or the
 * other; this only ever shows the OS prompt the first time it's genuinely undetermined.
 */

/** The one, fixed identifier the "time remaining" ongoing notification always reposts under —
    posting again with the same `identifier` replaces the existing notification in place rather
    than stacking a new banner in the tray on every update. Declared up top (not just above
    `postOngoingTimerNotification` below) so the notification handler can also reference it, to
    distinguish a routine ongoing-status repost from a real "a segment just ended" alert. */
const ONGOING_ID = 'practice-timer-ongoing';

let channelReady = false;

async function ensureAndroidChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  channelReady = true;
  // Android notification channels are immutable after creation — only the name/description can
  // be changed later, not sound/importance/vibration (confirmed directly in
  // `setNotificationChannelAsync`'s own doc comment). Deleting first, unconditionally, means a
  // device that already created this channel under an earlier, buggy config (the `sound:
  // 'default'` mistake fixed below) actually gets the corrected one on next launch instead of
  // silently keeping the old channel's settings forever under the same id.
  await Notifications.deleteNotificationChannelAsync('practice-timer');
  await Notifications.setNotificationChannelAsync('practice-timer', {
    name: 'Practice Timer',
    importance: Notifications.AndroidImportance.HIGH,
    // Deliberately omitted, not set to `'default'` — the native Android implementation
    // (`AndroidXNotificationsChannelManager.customSoundExists`) treats *any* string here,
    // including the literal `'default'`, as a custom bundled sound filename to resolve, with no
    // special case for that word at all; omitting the key entirely is what actually makes it fall
    // back to `Settings.System.DEFAULT_NOTIFICATION_URI` (confirmed directly by reading that
    // class's own source, after a real on-device warning showed `sound: 'default'` here was wrong
    // the same way it was for `scheduleTimerNotification`'s per-notification `content.sound`).
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Shows a scheduled notification's own banner/sound even while the app is already open and in
    the foreground — deliberately, not suppressed: "I want... notifications... when I'm in other
    pages of the app" is explicitly about being alerted regardless of which screen is currently
    open, not just while the app is backgrounded. The one exception is the ongoing "time remaining"
    notification (`ONGOING_ID`) — it reposts on every pause/resume/step transition, and without this
    special case each of those would *also* pop a heads-up banner for what's meant to be a quiet,
    always-there status line, not a fresh alert every time its own text changes. It still shows up
    in the notification list/tray (`shouldShowList: true`), just without the intrusive popup. */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isOngoing = notification.request.identifier === ONGOING_ID;
    return {
      shouldShowBanner: !isOngoing,
      shouldShowList: true,
      shouldPlaySound: !isOngoing,
      shouldSetBadge: false,
    };
  },
});

/** Schedules a one-shot local notification `secondsFromNow` in the future. Returns its id (for
    cancelling it later via `cancelNotification`/`cancelAllNotifications`), or `null` if permission
    isn't granted — callers should treat a `null` return the same as "no notification will arrive,"
    not as an error to surface, since a user who's denied notification permission has already made
    that choice deliberately. */
export async function scheduleTimerNotification({
  title,
  body,
  secondsFromNow,
  sound,
}: {
  title: string;
  body: string;
  secondsFromNow: number;
  sound: boolean;
}): Promise<string | null> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return null;
  return Notifications.scheduleNotificationAsync({
    // `content.sound` is `boolean | 'default' | 'defaultCritical' | 'defaultRingtone' |
    // (string & {})` — a *plain string* here (including the literal `'default'`) is treated as a
    // *custom* bundled sound filename needing config-plugin registration, not a request for the
    // system default (confirmed directly: a real on-device LogBox warning, "Custom sound 'default'
    // not found in native app... add it to the config plugin's sounds array"). `true` is the
    // actual documented way to ask for the normal default notification sound; `false` is silent.
    // (The notification *channel*'s own `sound` field, set once in `ensureAndroidChannel` above,
    // is a different type — `string | null` — where the literal `'default'` genuinely is correct.)
    content: { title, body, sound },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(secondsFromNow)),
      // A real, confirmed-from-the-library's-own-types bug, not a guess: `TimeIntervalTriggerInput`
      // has its own optional `channelId`, and without setting it explicitly every scheduled
      // notification fell back to whatever default channel `expo-notifications` resolves to on its
      // own — not the HIGH-importance `'practice-timer'` channel actually configured in
      // `ensureAndroidChannel` below, which is exactly the kind of gap that produces "sometimes it
      // just doesn't show as a heads-up banner" style inconsistency.
      channelId: 'practice-timer',
    },
  });
}

/** Posts (or updates in place) the always-visible "what's running right now" notification —
    `sticky: true` (Android's `setOngoing(true)`, not swipe-dismissable while the timer's running)
    and `autoDismiss: false` (tapping it doesn't clear it either). No sound of its own — this is a
    status display, not an alert; the actual segment-transition sound comes from
    `scheduleTimerNotification`'s own scheduled notification plus the in-app chime
    (`lib/practiceTimerChime.ts`), not from reposting this one. `trigger: { channelId }` is
    `expo-notifications`' own documented way to post *immediately* while still specifying which
    Android channel it belongs to — `trigger: null` also posts immediately, but leaves the channel
    unspecified the same way the scheduled-notification bug above did. */
export async function postOngoingTimerNotification({ title, body }: { title: string; body: string }): Promise<void> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ONGOING_ID,
      content: { title, body, sticky: true, autoDismiss: false, sound: false },
      trigger: { channelId: 'practice-timer' },
    });
  } catch {
    // best-effort — the in-app state is still correct either way
  }
}

/** Removes the ongoing "time remaining" notification — called once the run actually stops, not on
    every step transition (which instead just reposts under the same `ONGOING_ID` above). */
export async function dismissOngoingTimerNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(ONGOING_ID);
  } catch {
    // already gone, or notifications unavailable — either way nothing left to clean up
  }
}

/** Cancels every pending Practice Timer notification — simpler and just as correct as tracking one
    specific id to cancel, since this is the only feature in the app that ever schedules a local
    notification at all; nothing else's own schedule could be accidentally swept up by this. Only
    ever targets *scheduled* (future) notifications, not the already-posted ongoing one above,
    which has its own explicit `dismissOngoingTimerNotification`. */
export async function cancelAllTimerNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // nothing pending, or notifications genuinely unavailable on this device — either way, the
    // in-app state is still correct, this is just best-effort cleanup of an OS-level schedule.
  }
}
