import { useState } from "react";
import type { LevelResult } from "@/components/learning/LevelComplete";
import {
  LEARNING_LEVELS,
  LearningTrack,
  currentLevelIndex,
  starsFor,
} from "@/lib/learningPath";
import { Grade, scoreOf } from "@/lib/noteGrade";
import { useLearningPath } from "@/lib/useLearningPath";

/** Learn-mode state for one ear-training tool: its path progress, which level is picked to play
    (the current one unless you choose an earlier one to replay), and the result screen shown
    after a level attempt. */
export function useLearnSession(track: LearningTrack) {
  const { progress, record } = useLearningPath(track);
  const levels = LEARNING_LEVELS[track];
  const current = currentLevelIndex(track, progress);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<LevelResult | null>(null);
  const selected = Math.min(picked ?? current, current, levels.length - 1);

  /** Scores a finished attempt at `index`, saves it, and opens the result screen. */
  function finish(index: number, grades: Grade[]) {
    const level = levels[index];
    const correct = scoreOf(grades);
    const score = grades.length ? correct / grades.length : 0;
    const firstPass = record(level.id, score);
    const passed = starsFor(score) > 0;
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
    // A new pass moves the selection on to the level it just unlocked.
    if (firstPass) setPicked(null);
  }

  return {
    progress,
    levels,
    current,
    selected,
    select: setPicked,
    result,
    clearResult: () => setResult(null),
    finish,
  };
}
