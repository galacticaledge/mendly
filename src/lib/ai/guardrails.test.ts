/**
 * The guardrails are the safety boundary between a language model and a
 * patient, so they are tested against a proposal that breaks every rule at
 * once rather than against a well-behaved one.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyGuardrails, validatePractitionerEdit } from "@/lib/ai/guardrails";
import type { ExerciseSetProposal, PractitionerRules } from "@/lib/contracts";

const rules: PractitionerRules = {
  allowedExerciseIds: ["card_match", "arm_raise", "elbow_bend"],
  maxLevel: { card_match: 3, arm_raise: 2, elbow_bend: 2 },
  standingAllowed: false,
  contraindications: ["overhead_reach"],
  maxExercisesPerSet: 3,
  maxMotorMinutes: 12,
  affectedSide: "right",
  goals: [],
  notes: "",
};

function proposal(exercises: { exerciseId: string; level: number }[]): ExerciseSetProposal {
  return {
    exercises: exercises.map((e) => ({ ...e, level: e.level as 1, rationale: "test" })),
    summary: "test",
    source: "backboard",
  };
}

test("an exercise the model invented is removed", () => {
  const result = applyGuardrails(proposal([{ exerciseId: "moon_walk", level: 1 }]), rules);
  assert.equal(result.proposal.exercises.length, 0);
  assert.equal(result.violations[0].code, "unknown_exercise");
});

test("a real exercise outside this patient's pool is removed", () => {
  // seated_march exists in the catalog but is not in this patient's pool.
  const result = applyGuardrails(proposal([{ exerciseId: "seated_march", level: 1 }]), rules);
  assert.equal(result.proposal.exercises.length, 0);
  assert.equal(result.violations[0].code, "not_in_pool");
});

test("a level above the practitioner's ceiling is lowered, not dropped", () => {
  const result = applyGuardrails(proposal([{ exerciseId: "arm_raise", level: 5 }]), rules);
  assert.equal(result.proposal.exercises.length, 1);
  assert.equal(result.proposal.exercises[0].level, 2);
  assert.equal(result.violations[0].code, "level_above_cap");
});

test("a standing exercise is refused when standing is not allowed", () => {
  const withStanding = { ...rules, allowedExerciseIds: [...rules.allowedExerciseIds, "sit_to_stand"] };
  const result = applyGuardrails(proposal([{ exerciseId: "sit_to_stand", level: 1 }]), withStanding);
  assert.equal(result.proposal.exercises.length, 0);
  assert.equal(result.violations[0].code, "standing_not_allowed");
});

test("a contraindicated tag blocks the exercise even when it is in the pool", () => {
  const withOverhead = {
    ...rules,
    allowedExerciseIds: [...rules.allowedExerciseIds, "overhead_arm_raise"],
    maxLevel: { ...rules.maxLevel, overhead_arm_raise: 3 as const },
  };
  const result = applyGuardrails(proposal([{ exerciseId: "overhead_arm_raise", level: 1 }]), withOverhead);
  assert.equal(result.proposal.exercises.length, 0);
  assert.equal(result.violations[0].code, "contraindicated");
});

test("the set is cut to the maximum length", () => {
  const short = { ...rules, maxExercisesPerSet: 2 };
  const result = applyGuardrails(
    proposal([
      { exerciseId: "card_match", level: 1 },
      { exerciseId: "arm_raise", level: 1 },
      { exerciseId: "elbow_bend", level: 1 },
    ]),
    short,
  );
  assert.equal(result.proposal.exercises.length, 2);
  assert.equal(result.violations[0].code, "set_too_long");
});

test("motor work is held under the time ceiling", () => {
  const tight = { ...rules, maxMotorMinutes: 1 };
  const result = applyGuardrails(
    proposal([
      { exerciseId: "arm_raise", level: 2 },
      { exerciseId: "elbow_bend", level: 2 },
    ]),
    tight,
  );
  assert.ok(result.violations.some((v) => v.code === "over_motor_minutes"));
});

test("a duplicate is removed once, keeping the first", () => {
  const result = applyGuardrails(
    proposal([
      { exerciseId: "arm_raise", level: 1 },
      { exerciseId: "arm_raise", level: 2 },
    ]),
    rules,
  );
  assert.equal(result.proposal.exercises.length, 1);
  assert.equal(result.proposal.exercises[0].level, 1);
  assert.equal(result.violations[0].code, "duplicate");
});

test("a proposal breaking every rule survives as nothing, with a reason for each", () => {
  const result = applyGuardrails(
    proposal([
      { exerciseId: "moon_walk", level: 9 },
      { exerciseId: "seated_march", level: 1 },
      { exerciseId: "sit_to_stand", level: 4 },
    ]),
    rules,
  );
  assert.equal(result.proposal.exercises.length, 0);
  assert.equal(result.violations.length, 3);
});

test("a practitioner's own edit is checked for shape but not against their ceiling", () => {
  // Level 5 is above the ceiling the practitioner set earlier. They are the
  // authority, so their edit stands; the route records the raised ceiling.
  const ok = validatePractitionerEdit([{ exerciseId: "arm_raise", level: 5, rationale: "" }]);
  assert.equal(ok.ok, true);

  const bad = validatePractitionerEdit([{ exerciseId: "moon_walk", level: 1, rationale: "" }]);
  assert.equal(bad.ok, false);
});
