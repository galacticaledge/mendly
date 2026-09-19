/**
 * Turning stored results into a short performance picture.
 *
 * This is the "run through the data" step of the AI agent flow. It runs before
 * any model call, for two reasons: a compact summary is far more reliable input
 * than a pile of raw rows, and the same summary drives the deterministic
 * adaptation policy, so the system behaves the same way with or without a model.
 */

import type { CognitiveResult, ExerciseResult, Level, MotorResult } from "@/lib/contracts";
import { getLevel, requireExercise } from "@/lib/exercises/catalog";

/** How an exercise went, reduced to the few numbers that drive a decision. */
export type ExercisePerformance = {
  exerciseId: string;
  name: string;
  modality: "motor" | "cognitive";
  lastLevel: Level;
  /** Fraction of the target that was completed, 0–1. */
  completion: number;
  /** Motor: achieved ROM over target ROM. Cognitive: accuracy. Both 0–1+. */
  quality: number;
  /**
   * How much the measurement can be leaned on, 0–1. For motor work this is
   * tracking confidence; cognitive results are self-reporting, so they are
   * fully trusted.
   */
  reliability: number;
  /** One line for a practitioner or a prompt. */
  summary: string;
  attempts: number;
};

export type PerformanceProfile = {
  byExercise: ExercisePerformance[];
  /** Sessions the patient actually finished, out of those started. */
  sessionsCompleted: number;
  /** Plain-language notes about the overall picture, for the prompt. */
  observations: string[];
};

function motorPerformance(result: MotorResult): Omit<ExercisePerformance, "name"> {
  const exercise = requireExercise(result.exercise_id);
  const rung = getLevel(exercise, result.level) as { targetRomDeg: number };
  const completion = result.target_reps > 0 ? result.valid_reps / result.target_reps : 0;
  const quality = rung.targetRomDeg > 0 ? result.rom_mean_deg / rung.targetRomDeg : 0;

  return {
    exerciseId: result.exercise_id,
    modality: "motor",
    lastLevel: result.level,
    completion,
    quality,
    reliability: result.tracking_confidence,
    attempts: 1,
    summary:
      `${result.valid_reps} of ${result.target_reps} repetitions at level ${result.level}, ` +
      `average range of motion ${Math.round(result.rom_mean_deg)}° against a ${rung.targetRomDeg}° target, ` +
      `tracking confidence ${result.tracking_confidence.toFixed(2)}` +
      (result.invalid_segments > 0 ? `, tracking dropped ${result.invalid_segments} time(s)` : ""),
  };
}

function cognitivePerformance(result: CognitiveResult): Omit<ExercisePerformance, "name"> {
  return {
    exerciseId: result.exercise_id,
    modality: "cognitive",
    lastLevel: result.level,
    completion: result.status === "completed" ? 1 : 0,
    quality: result.accuracy,
    reliability: 1,
    attempts: 1,
    summary:
      `${Math.round(result.accuracy * 100)}% correct at level ${result.level} over ${result.attempts} attempts, ` +
      `average response ${Math.round(result.avg_reaction_ms)}ms, ${result.errors} error(s), ${result.hints_used} hint(s)`,
  };
}

export function summarizeResult(result: ExerciseResult): Omit<ExercisePerformance, "name"> {
  return result.modality === "motor" ? motorPerformance(result) : cognitivePerformance(result);
}

/**
 * Build a profile from a patient's recent results, newest first.
 *
 * Only the most recent attempt at each exercise sets the numbers that drive
 * adaptation — older attempts are counted so the AI can see how much practice
 * there has been, but they do not pull a current decision towards stale data.
 */
export function buildProfile(
  recentResults: ExerciseResult[],
  sessionsCompleted: number,
): PerformanceProfile {
  const byExercise = new Map<string, ExercisePerformance>();

  for (const result of recentResults) {
    const existing = byExercise.get(result.exercise_id);
    if (existing) {
      existing.attempts += 1;
      continue;
    }
    const base = summarizeResult(result);
    byExercise.set(result.exercise_id, {
      ...base,
      name: requireExercise(result.exercise_id).name,
    });
  }

  const list = [...byExercise.values()];
  const observations: string[] = [];

  const unreliable = list.filter((p) => p.modality === "motor" && p.reliability < 0.6);
  if (unreliable.length > 0) {
    observations.push(
      `Camera tracking was weak for: ${unreliable.map((p) => p.name).join(", ")}. ` +
        `Treat those numbers as uncertain rather than as poor performance.`,
    );
  }

  const strong = list.filter((p) => p.completion >= 0.9 && p.quality >= 0.95 && p.reliability >= 0.6);
  if (strong.length > 0) {
    observations.push(`Comfortably meeting the target on: ${strong.map((p) => p.name).join(", ")}.`);
  }

  const struggling = list.filter((p) => p.reliability >= 0.6 && (p.completion < 0.6 || p.quality < 0.6));
  if (struggling.length > 0) {
    observations.push(`Falling short of the target on: ${struggling.map((p) => p.name).join(", ")}.`);
  }

  if (list.length === 0) {
    observations.push("No measured sessions yet. This is a starting baseline.");
  }

  return { byExercise: list, sessionsCompleted, observations };
}
