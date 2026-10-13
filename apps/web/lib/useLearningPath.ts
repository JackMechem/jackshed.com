import {
  DEFAULT_LEARNING_PROGRESS,
  LEARNING_KEY,
  LearningTrack,
  PASS_SCORE,
  TrackProgress,
} from "@/lib/learningPath";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** One tool's learning-path progress, synced to the account like every other tool setting (one
    shared key for all three ear-training tools, so the dashboard and profile can read it). */
export function useLearningPath(track: LearningTrack): {
  progress: TrackProgress;
  /** Saves an attempt's score (0-1); returns whether this attempt passed the level for the
      first time. */
  record: (levelId: string, score: number) => boolean;
} {
  const [all, update] = useSyncedSettings(LEARNING_KEY, DEFAULT_LEARNING_PROGRESS);
  const progress = all[track] && typeof all[track] === "object" ? all[track] : {};
  function record(levelId: string, score: number): boolean {
    const prev = progress[levelId];
    const passed = score >= PASS_SCORE;
    const firstPass = passed && !prev?.passedAt;
    update({
      [track]: {
        ...progress,
        [levelId]: {
          best: Math.max(prev?.best ?? 0, score),
          passedAt: prev?.passedAt ?? (passed ? Date.now() : null),
        },
      },
    });
    return firstPass;
  }
  return { progress, record };
}
