/**
 * Difficulty adaptation between exercises.
 *
 * This is deliberately a plain policy rather than a model call. It runs between
 * one exercise and the next while the patient is waiting, so it has to be
 * instant, identical every time, and explainable to a practitioner who asks why
 * the level changed (docs/10, Rule 8: no model in the loop of a live session).
 *
 * The model's job is the larger one — proposing the set in the first place.
 */

import type { ExerciseResult, Level, PractitionerRules } from "@/lib/contracts";
import { summarizeResult } from "@/lib/ai/performance";

export type Adaptation = {
  exerciseId: string;
  fromLevel: Level;
  toLevel: Level;
  /** One sentence, written for the patient, explaining the change. */
  reason: string;
  direction: "up" | "down" | "hold";
};

/** Below this, a motor measurement is not trusted enough to change a level. */
const MIN_RELIABILITY = 0.6;

function clamp(level: number, cap: Level): Level {
  return Math.min(Math.max(Math.round(level), 1), cap) as Level;
}

/**
 * Decide the level for the next attempt at an exercise, given how the last one
 * went. The practitioner's ceiling is applied last and is never exceeded.
 */
export function adaptLevel(result: ExerciseResult, rules: PractitionerRules): Adaptation {
  const perf = summarizeResult(result);
  const cap = rules.maxLevel[result.exercise_id] ?? 1;
  const from = result.level;

  const hold = (reason: string): Adaptation => ({
    exerciseId: result.exercise_id,
    fromLevel: from,
    toLevel: clamp(from, cap),
    reason,
    direction: "hold",
  });

  // Rule 7: never adapt on measurements the CV layer has flagged as unreliable.
  // A low ROM reading from a body the camera could barely see is a camera
  // problem, and treating it as poor performance would push the level down for
  // the wrong reason.
  if (perf.modality === "motor" && perf.reliability < MIN_RELIABILITY) {
    return hold("The camera could not see you clearly, so this stays the same for now.");
  }

  if (result.status === "stopped_early" || result.status === "tracking_failed") {
    const to = clamp(from - 1, cap);
    return {
      exerciseId: result.exercise_id,
      fromLevel: from,
      toLevel: to,
      direction: to < from ? "down" : "hold",
      reason:
        to < from
          ? "You stopped this one early, so next time it starts a little easier."
          : "This stays the same next time.",
    };
  }

  const comfortable = perf.completion >= 0.9 && perf.quality >= 0.95;
  const hard = perf.completion < 0.6 || perf.quality < 0.6;

  if (comfortable && from < cap) {
    return {
      exerciseId: result.exercise_id,
      fromLevel: from,
      toLevel: clamp(from + 1, cap),
      direction: "up",
      reason: "You met the target, so this moves up a step.",
    };
  }

  if (comfortable && from >= cap) {
    return hold("You met the target. This is the highest level your care team has set.");
  }

  if (hard && from > 1) {
    return {
      exerciseId: result.exercise_id,
      fromLevel: from,
      toLevel: clamp(from - 1, cap),
      direction: "down",
      reason: "This one was hard today, so it steps back down.",
    };
  }

  if (hard) {
    return hold("This one was hard today. It stays at the gentlest level.");
  }

  return hold("This stays at the same level next time.");
}

/**
 * Apply an adaptation to the remaining exercises of an approved set.
 *
 * Only the level moves. Which exercises the patient does was decided by the
 * practitioner when they approved the set, and adaptation does not get to
 * revisit that — it adjusts difficulty inside their decision.
 */
export function applyAdaptationToRemaining(
  remaining: { exerciseId: string; level: Level }[],
  adaptation: Adaptation,
): { exerciseId: string; level: Level }[] {
  return remaining.map((item) =>
    item.exerciseId === adaptation.exerciseId ? { ...item, level: adaptation.toLevel } : item,
  );
}
