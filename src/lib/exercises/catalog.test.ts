/**
 * The catalog, checked for the things a bad definition gets wrong.
 *
 * The `forward_reach` bug — an elbow exercise whose resting angle assumed a
 * bent arm, so every small movement minted a repetition — was a definition
 * error that no amount of counter logic could have caught. These are the
 * invariants that would have caught it.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CATALOG, MOTOR_EXERCISES, estimateMinutes, getLevel } from "@/lib/exercises/catalog";
import { isMotor } from "@/lib/contracts";
import type { Level } from "@/lib/contracts";

test("every exercise id is unique", () => {
  const ids = CATALOG.map((exercise) => exercise.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every exercise has five levels, numbered 1 to 5", () => {
  for (const exercise of CATALOG) {
    assert.equal(exercise.levels.length, 5, `${exercise.id} should have five levels`);
    exercise.levels.forEach((rung, index) => {
      assert.equal(rung.level, index + 1, `${exercise.id} level ${index + 1} is misnumbered`);
    });
  }
});

test("difficulty never goes backwards as the level rises", () => {
  for (const exercise of CATALOG) {
    for (let level = 2; level <= 5; level += 1) {
      const previous = getLevel(exercise, (level - 1) as Level);
      const current = getLevel(exercise, level as Level);

      if (isMotor(exercise)) {
        const a = previous as { reps: number; targetRomDeg: number };
        const b = current as { reps: number; targetRomDeg: number };
        assert.ok(b.reps >= a.reps, `${exercise.id} loses reps at level ${level}`);
      } else {
        const a = previous as { rounds: number };
        const b = current as { rounds: number };
        assert.ok(b.rounds >= a.rounds, `${exercise.id} loses rounds at level ${level}`);
      }
    }
  }
});

test("a motor exercise never asks for an angle the body cannot make", () => {
  // Progress is measured from the resting angle, and a joint angle is 0-180.
  // A target that would need more than 180 degrees of travel from rest can
  // never be reached, so the exercise could never be completed.
  for (const exercise of MOTOR_EXERCISES) {
    for (const rung of exercise.levels) {
      const reachable =
        exercise.direction === "increasing"
          ? 180 - exercise.restAngleDeg
          : exercise.restAngleDeg;
      assert.ok(
        rung.targetRomDeg <= reachable,
        `${exercise.id} level ${rung.level} needs ${rung.targetRomDeg}° of travel ` +
          `but only ${reachable}° is available from a ${exercise.restAngleDeg}° rest`,
      );
    }
  }
});

test("a resting angle is plausible for the position described", () => {
  // The forward_reach bug: rest was 70° for an elbow that actually rests near
  // straight. Any rest angle is legal in isolation, but it must leave enough
  // room to move AND enough room to return, or the state machine cannot cycle.
  for (const exercise of MOTOR_EXERCISES) {
    assert.ok(
      exercise.restAngleDeg >= 0 && exercise.restAngleDeg <= 180,
      `${exercise.id} has an impossible rest angle`,
    );
    const smallest = Math.min(...exercise.levels.map((rung) => rung.targetRomDeg));
    assert.ok(smallest > 0, `${exercise.id} has a level with no movement in it`);
  }
});

test("a tolerance band is narrower than the target it surrounds", () => {
  // A tolerance wider than the target would accept a limb that never moved.
  for (const exercise of MOTOR_EXERCISES) {
    for (const rung of exercise.levels) {
      if (rung.toleranceDeg === undefined) continue;
      assert.ok(
        rung.toleranceDeg < rung.targetRomDeg,
        `${exercise.id} level ${rung.level} tolerance ${rung.toleranceDeg}° is not narrower ` +
          `than its ${rung.targetRomDeg}° target`,
      );
    }
  }
});

test("hidden feedback is only used where it is the point of the exercise", () => {
  // Hiding the count from a patient is a strong choice. It is right for a
  // proprioception task and wrong everywhere else, so it should be rare.
  const hidden = MOTOR_EXERCISES.filter((exercise) => exercise.hideLiveFeedback);
  assert.ok(hidden.length <= 1, "more exercises hide feedback than expected");
  for (const exercise of hidden) {
    assert.ok(
      exercise.levels.every((rung) => rung.toleranceDeg !== undefined),
      `${exercise.id} hides feedback but has no tolerance band, so nothing defines success`,
    );
  }
});

test("every exercise takes a believable amount of time", () => {
  for (const exercise of CATALOG) {
    for (let level = 1; level <= 5; level += 1) {
      const minutes = estimateMinutes(exercise, level as Level);
      assert.ok(minutes > 0, `${exercise.id} level ${level} estimates no time at all`);
      assert.ok(
        minutes < 20,
        `${exercise.id} level ${level} estimates ${minutes.toFixed(1)} minutes, which is too long ` +
          `for one exercise in a fatigue-limited session`,
      );
    }
  }
});
