/**
 * Guardrails: the validation step in the AI agent flow.
 *
 * Every proposal, whether it came from Gemini or from the local rules engine,
 * passes through `applyGuardrails` before a human ever sees it. The rule from
 * the architecture plan is "never recommend exercises that are outside the
 * specified parameters", and this file is where that is actually enforced —
 * not in the prompt, which a model is free to ignore.
 *
 * The function never throws on a bad proposal. It removes or clamps what it
 * cannot allow and reports every change, because a practitioner reviewing the
 * set needs to see what the AI tried to do as well as what survived.
 */

import type {
  ExerciseSetProposal,
  GuardrailResult,
  GuardrailViolation,
  Level,
  PractitionerRules,
  ProposedExercise,
} from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";
import { estimateMinutes, getExercise } from "@/lib/exercises/catalog";

/** Level the AI gets when the practitioner has set no ceiling for an exercise. */
const DEFAULT_MAX_LEVEL: Level = 1;

export function applyGuardrails(
  proposal: ExerciseSetProposal,
  rules: PractitionerRules,
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const kept: ProposedExercise[] = [];
  const seen = new Set<string>();
  let motorMinutes = 0;

  for (const candidate of proposal.exercises) {
    const exercise = getExercise(candidate.exerciseId);

    // 1. The exercise has to exist. A model can hallucinate an id, and an id
    //    that is not in the catalog has no definition, no levels and no way to
    //    be measured, so there is nothing safe to do with it.
    if (!exercise) {
      violations.push({
        exerciseId: candidate.exerciseId,
        code: "unknown_exercise",
        message: `"${candidate.exerciseId}" is not an exercise in the catalog. Removed.`,
      });
      continue;
    }

    // 2. It has to be in this patient's approved pool. The catalog is what the
    //    product can do; the pool is what this practitioner has permitted for
    //    this patient, and only the second one grants permission.
    if (!rules.allowedExerciseIds.includes(exercise.id)) {
      violations.push({
        exerciseId: exercise.id,
        code: "not_in_pool",
        message: `${exercise.name} is not in this patient's approved pool. Removed.`,
      });
      continue;
    }

    // 3. No repeats. A duplicate is usually a model slip, and it would also
    //    quietly double the time and repetition count the practitioner sees.
    if (seen.has(exercise.id)) {
      violations.push({
        exerciseId: exercise.id,
        code: "duplicate",
        message: `${exercise.name} was proposed twice. The second one was removed.`,
      });
      continue;
    }

    // 4. Contraindications are checked by tag, so one setting covers every
    //    exercise with that demand, including ones added to the catalog later.
    const blocked = exercise.tags.filter((tag) => rules.contraindications.includes(tag));
    if (blocked.length > 0) {
      violations.push({
        exerciseId: exercise.id,
        code: "contraindicated",
        message: `${exercise.name} involves ${blocked.join(", ")}, which is excluded for this patient. Removed.`,
      });
      continue;
    }

    // 5. Standing is refused unless it has been explicitly allowed. This is a
    //    separate switch from the pool because a patient's standing tolerance
    //    changes far more often than their exercise pool does.
    if (isMotor(exercise) && exercise.posture === "standing" && !rules.standingAllowed) {
      violations.push({
        exerciseId: exercise.id,
        code: "standing_not_allowed",
        message: `${exercise.name} is done standing, which is not currently allowed for this patient. Removed.`,
      });
      continue;
    }

    // 6. Difficulty is clamped rather than removed. The practitioner has said
    //    this exercise is appropriate; only the rung was too high, so the
    //    exercise is kept at the highest rung they did permit.
    const cap = rules.maxLevel[exercise.id] ?? DEFAULT_MAX_LEVEL;
    let level = candidate.level;
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      level = DEFAULT_MAX_LEVEL;
    }
    if (level > cap) {
      violations.push({
        exerciseId: exercise.id,
        code: "level_above_cap",
        message: `${exercise.name} was proposed at level ${level}; the limit for this patient is ${cap}. Lowered to ${cap}.`,
      });
      level = cap;
    }

    // 7. Set length. Anything past the limit is dropped, keeping the earlier
    //    exercises, which the AI ordered by priority.
    if (kept.length >= rules.maxExercisesPerSet) {
      violations.push({
        exerciseId: exercise.id,
        code: "set_too_long",
        message: `The set may hold at most ${rules.maxExercisesPerSet} exercises. ${exercise.name} was removed.`,
      });
      continue;
    }

    // 8. Time ceiling on motor work, for fatigue. Cognitive exercises are not
    //    counted here: the ceiling exists for physical effort.
    if (isMotor(exercise)) {
      const minutes = estimateMinutes(exercise, level as Level);
      if (motorMinutes + minutes > rules.maxMotorMinutes) {
        violations.push({
          exerciseId: exercise.id,
          code: "over_motor_minutes",
          message: `Adding ${exercise.name} would pass the ${rules.maxMotorMinutes} minute limit on movement exercises. Removed.`,
        });
        continue;
      }
      motorMinutes += minutes;
    }

    seen.add(exercise.id);
    kept.push({ ...candidate, exerciseId: exercise.id, level: level as Level });
  }

  return {
    proposal: { ...proposal, exercises: kept },
    violations,
  };
}

/**
 * Whether a set is safe to hand to a patient right now.
 *
 * Note what this does NOT check: practitioner approval. Passing the guardrails
 * makes a set legal, not approved. Approval is a separate human act recorded
 * on the exercise set itself, and `src/lib/db/queries.ts` is what enforces it.
 */
export function isDeliverable(result: GuardrailResult): boolean {
  return result.proposal.exercises.length > 0;
}

/**
 * Check a practitioner's own edit of a proposal. A practitioner may raise a
 * level beyond their own earlier ceiling — they are the authority, and doing so
 * updates the ceiling — but they cannot add an exercise that is not in the
 * catalog, and the result still has to be something the system can measure.
 */
export function validatePractitionerEdit(
  exercises: ProposedExercise[],
): { ok: true; exercises: ProposedExercise[] } | { ok: false; error: string } {
  if (exercises.length === 0) {
    return { ok: false, error: "A set needs at least one exercise." };
  }
  const out: ProposedExercise[] = [];
  const seen = new Set<string>();
  for (const candidate of exercises) {
    const exercise = getExercise(candidate.exerciseId);
    if (!exercise) {
      return { ok: false, error: `"${candidate.exerciseId}" is not an exercise in the catalog.` };
    }
    if (seen.has(exercise.id)) {
      return { ok: false, error: `${exercise.name} appears twice in the set.` };
    }
    if (!Number.isInteger(candidate.level) || candidate.level < 1 || candidate.level > 5) {
      return { ok: false, error: `${exercise.name} has no level ${candidate.level}.` };
    }
    seen.add(exercise.id);
    out.push({ ...candidate, exerciseId: exercise.id });
  }
  return { ok: true, exercises: out };
}
