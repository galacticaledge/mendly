import "server-only";
import type { ExerciseResult, Level } from "@/lib/contracts";
import { getExercise, getLevel } from "@/lib/exercises/catalog";

/**
 * Check a result that arrived from a browser.
 *
 * The measurements are computed client-side, which means they are submitted by
 * something we do not control. That is fine for a rehabilitation reading — the
 * patient has no reason to cheat — but it is not fine as an input to a stored
 * record a practitioner will read and an AI will act on. So the shape is
 * checked, the numbers are held to physically sensible ranges, and the exercise
 * has to be one the session was actually approved for.
 *
 * Returns the cleaned result, or an error message.
 */
export function validateResult(
  raw: unknown,
  allowed: { exerciseId: string; level: Level }[],
): { ok: true; result: ExerciseResult } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "The result was not an object." };
  }
  const body = raw as Record<string, unknown>;

  const exerciseId = typeof body.exercise_id === "string" ? body.exercise_id : null;
  if (!exerciseId) return { ok: false, error: "The result has no exercise id." };

  const exercise = getExercise(exerciseId);
  if (!exercise) return { ok: false, error: `Unknown exercise: ${exerciseId}` };

  const approved = allowed.find((item) => item.exerciseId === exerciseId);
  if (!approved) {
    return { ok: false, error: `${exercise.name} is not part of this session.` };
  }

  const level = Number(body.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    return { ok: false, error: "The result has no valid level." };
  }

  const num = (value: unknown, min: number, max: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  };

  if (body.modality === "motor" && exercise.modality === "motor") {
    const rung = getLevel(exercise, level as Level) as { reps: number };
    const reps = Array.isArray(body.reps) ? body.reps : [];

    return {
      ok: true,
      result: {
        modality: "motor",
        exercise_id: exerciseId,
        level: level as Level,
        status:
          body.status === "stopped_early" || body.status === "tracking_failed"
            ? body.status
            : "completed",
        // A patient cannot do more repetitions than the level asked for: the
        // tracker stops at the target, so a larger number is a bug, not a feat.
        valid_reps: Math.round(num(body.valid_reps, 0, rung.reps)),
        target_reps: rung.reps,
        // 180° is the largest angle that exists in this measurement.
        rom_mean_deg: num(body.rom_mean_deg, 0, 180),
        rom_min_deg: num(body.rom_min_deg, 0, 180),
        rom_max_deg: num(body.rom_max_deg, 0, 180),
        avg_rep_duration_s: num(body.avg_rep_duration_s, 0, 600),
        tracking_confidence: num(body.tracking_confidence, 0, 1),
        invalid_segments: Math.round(num(body.invalid_segments, 0, 1000)),
        reps: reps.slice(0, 200).map((rep, index) => {
          const r = (rep ?? {}) as Record<string, unknown>;
          return {
            rep: index + 1,
            rom_deg: num(r.rom_deg, 0, 180),
            duration_s: num(r.duration_s, 0, 600),
            valid: Boolean(r.valid),
            tracking_confidence: num(r.tracking_confidence, 0, 1),
          };
        }),
      },
    };
  }

  if (body.modality === "cognitive" && exercise.modality === "cognitive") {
    return {
      ok: true,
      result: {
        modality: "cognitive",
        exercise_id: exerciseId,
        level: level as Level,
        status: body.status === "stopped_early" ? "stopped_early" : "completed",
        accuracy: num(body.accuracy, 0, 1),
        avg_reaction_ms: num(body.avg_reaction_ms, 0, 120_000),
        errors: Math.round(num(body.errors, 0, 10_000)),
        attempts: Math.round(num(body.attempts, 0, 10_000)),
        hints_used: Math.round(num(body.hints_used, 0, 10_000)),
      },
    };
  }

  return { ok: false, error: "The result's modality does not match the exercise." };
}
