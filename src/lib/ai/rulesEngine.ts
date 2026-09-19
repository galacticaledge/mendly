/**
 * The deterministic proposer.
 *
 * It does the same job as the model — choose a set of exercises and a level for
 * each — using only the practitioner's rules and the measured performance. It
 * exists for three reasons:
 *
 *  1. The product must work with no model key configured, including in a demo
 *     with no network.
 *  2. It is the fallback whenever a model call fails or returns something
 *     unparseable, so a patient is never left without a session because an API
 *     was down.
 *  3. It is the reference behaviour. If the model's proposal looks stranger
 *     than this one, that is worth noticing.
 */

import type { ExerciseSetProposal, Level, PractitionerRules, ProposedExercise } from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";
import type { PerformanceProfile } from "@/lib/ai/performance";
import { getExercise } from "@/lib/exercises/catalog";
import { adaptLevel } from "@/lib/ai/adapt";
import type { ExerciseResult } from "@/lib/contracts";

/**
 * Choose a level for an exercise the patient has done before, from the last
 * result; for one they have not, start at the gentlest rung the practitioner
 * allows, capped at 2 so a first attempt is never near the ceiling.
 */
function startingLevel(
  exerciseId: string,
  rules: PractitionerRules,
  lastResults: Map<string, ExerciseResult>,
): { level: Level; rationale: string } {
  const cap = rules.maxLevel[exerciseId] ?? 1;
  const last = lastResults.get(exerciseId);

  if (!last) {
    const level = Math.min(1, cap) as Level;
    return { level, rationale: "Not attempted before, so it starts at the gentlest level." };
  }

  const adaptation = adaptLevel(last, rules);
  return {
    level: adaptation.toLevel,
    rationale:
      adaptation.direction === "up"
        ? `Target met last time at level ${adaptation.fromLevel}, so it moves up.`
        : adaptation.direction === "down"
          ? `Last attempt at level ${adaptation.fromLevel} fell short of the target, so it steps down.`
          : `Held at level ${adaptation.toLevel} to build consistency.`,
  };
}

/**
 * Order the pool so the set is built in the order the product wants it done:
 * cognitive work first at the screen, then movement.
 *
 * The exercise flow in the architecture plan starts a session cognitive-only
 * and moves to motor work afterwards, so the camera only needs the full body
 * view once the person is already settled and the setup has been checked.
 */
function sessionOrder(a: string, b: string): number {
  const ea = getExercise(a);
  const eb = getExercise(b);
  if (!ea || !eb) return 0;
  if (ea.modality !== eb.modality) return ea.modality === "cognitive" ? -1 : 1;
  if (isMotor(ea) && isMotor(eb) && ea.posture !== eb.posture) {
    return ea.posture === "seated" ? -1 : 1;
  }
  return 0;
}

export function proposeWithRules(
  rules: PractitionerRules,
  profile: PerformanceProfile,
  lastResults: Map<string, ExerciseResult>,
): ExerciseSetProposal {
  // Practice the least-practised exercises first, so a set does not drill one
  // movement while another in the approved pool is never touched.
  const attempts = new Map(profile.byExercise.map((p) => [p.exerciseId, p.attempts]));
  const pool = [...rules.allowedExerciseIds]
    .filter((id) => getExercise(id))
    .sort((a, b) => (attempts.get(a) ?? 0) - (attempts.get(b) ?? 0));

  const chosen: ProposedExercise[] = [];
  for (const id of pool) {
    if (chosen.length >= rules.maxExercisesPerSet) break;
    const { level, rationale } = startingLevel(id, rules, lastResults);
    chosen.push({ exerciseId: id, level, rationale });
  }

  chosen.sort((a, b) => sessionOrder(a.exerciseId, b.exerciseId));

  const goalLine = rules.goals.length > 0 ? ` Working towards: ${rules.goals.join("; ")}.` : "";

  return {
    exercises: chosen,
    summary:
      `A set of ${chosen.length} exercise(s) drawn from the approved pool, with each level set from ` +
      `the most recent measured attempt.${goalLine}`,
    source: "rules-engine",
  };
}
