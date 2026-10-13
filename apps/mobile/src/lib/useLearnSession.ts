import {
  DEFAULT_LEARNING_PROGRESS,
  LEARNING_KEY,
  LEARNING_LEVELS,
  PASS_SCORE,
  currentLevelIndex,
  starsFor,
  type LearningTrack,
  type TrackProgress,
} from '@jam-practice/core/learningPath';
import { scoreOf, type Grade } from '@jam-practice/core/noteGrade';
import { useState } from 'react';

import { useSyncedSettings } from '@/lib/useSyncedSettings';

/** The result screen's data after a level attempt — same shape as web's `LevelResult`. */
export type LevelResult = {
  levelNumber: number;
  levelTitle: string;
  correct: number;
  total: number;
  score: number;
  stars: number;
  passed: boolean;
  firstPass: boolean;
  unlocked: { number: number; title: string } | null;
  pathDone: boolean;
};

/** All three tools' learning-path progress — the same synced key the website uses, so a level
    passed on one shows as passed on the other. */
export function useLearningProgress() {
  return useSyncedSettings(LEARNING_KEY, DEFAULT_LEARNING_PROGRESS);
}

/** Learn-mode state for one ear-training screen (native sibling of web's `lib/useLearnSession.ts`):
    its path progress, which level is picked (the current one unless an earlier one is chosen to
    replay), and the result shown after an attempt. */
export function useLearnSession(track: LearningTrack) {
  const [all, update] = useLearningProgress();
  const progress: TrackProgress = all[track] && typeof all[track] === 'object' ? all[track] : {};
  const levels = LEARNING_LEVELS[track];
  const current = currentLevelIndex(track, progress);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<LevelResult | null>(null);
  const selected = Math.min(picked ?? current, current, levels.length - 1);

  function finish(index: number, grades: Grade[]) {
    const level = levels[index];
    const correct = scoreOf(grades);
    const score = grades.length ? correct / grades.length : 0;
    const prev = progress[level.id];
    const passed = score >= PASS_SCORE;
    const firstPass = passed && !prev?.passedAt;
    update({
      [track]: {
        ...progress,
        [level.id]: { best: Math.max(prev?.best ?? 0, score), passedAt: prev?.passedAt ?? (passed ? Date.now() : null) },
      },
    });
    const next = levels[index + 1];
    setResult({
      levelNumber: index + 1,
      levelTitle: level.title,
      correct,
      total: grades.length,
      score,
      stars: starsFor(score),
      passed,
      firstPass,
      unlocked: passed && next ? { number: index + 2, title: next.title } : null,
      pathDone: passed && !next,
    });
    if (firstPass) setPicked(null);
  }

  return { progress, levels, current, selected, select: setPicked, result, clearResult: () => setResult(null), finish };
}
