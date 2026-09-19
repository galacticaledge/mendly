/**
 * The tracker, driven by synthetic pose frames.
 *
 * These cover the two ways a session can go wrong in front of a real person:
 * the count running past what was asked, and the count being manufactured out
 * of a starting position the exercise definition did not expect.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { MotorExercise, PoseFrame } from "@/lib/contracts";
import { requireExercise } from "@/lib/exercises/catalog";
import { ExerciseTracker } from "@/lib/cv/exerciseTracker";
import { readPoseObservation } from "@/lib/cv/inference";

/**
 * A body whose shoulder angle is `degrees`.
 *
 * The hip sits directly below the shoulder, so the first ray points straight
 * down; the elbow is placed `degrees` away from it. That makes the angle at
 * the shoulder exactly the number asked for, which is what lets these tests
 * talk in degrees rather than coordinates.
 */
function shoulderAt(degrees: number): PoseFrame {
  const radians = (degrees * Math.PI) / 180;
  const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 0.95 });

  const shoulder = { x: 0.5, y: 0.35 };
  const armLength = 0.2;

  return {
    nose: point(0.5, 0.2),
    left_shoulder: point(shoulder.x, shoulder.y),
    right_shoulder: point(shoulder.x, shoulder.y),
    left_hip: point(shoulder.x, shoulder.y + 0.25),
    right_hip: point(shoulder.x, shoulder.y + 0.25),
    left_elbow: point(
      shoulder.x + Math.sin(radians) * armLength,
      shoulder.y + Math.cos(radians) * armLength,
    ),
    right_elbow: point(
      shoulder.x + Math.sin(radians) * armLength,
      shoulder.y + Math.cos(radians) * armLength,
    ),
    left_wrist: point(shoulder.x, shoulder.y + 0.2),
    right_wrist: point(shoulder.x, shoulder.y + 0.2),
  };
}

/**
 * The same body, but with the upper arm pointing towards the camera: the
 * elbow sits almost on top of the shoulder in the image, which is what a reach
 * aimed at the lens looks like from the front.
 */
function armTowardsCamera(): PoseFrame {
  const frame = shoulderAt(45);
  const shoulder = frame.left_shoulder!;
  const collapsed = { x: shoulder.x + 0.01, y: shoulder.y + 0.01, z: -0.4, visibility: 0.95 };
  return { ...frame, left_elbow: collapsed, right_elbow: collapsed };
}

/** Feed a sequence of shoulder angles at roughly 30fps. */
function feed(tracker: ExerciseTracker, angles: number[], startMs = 0) {
  let t = startMs;
  for (const angle of angles) {
    tracker.update(shoulderAt(angle), t);
    t += 33;
  }
  return t;
}

/** A sweep from rest up to `peak` and back down again. */
function sweep(peak: number, rest = 15, steps = 14): number[] {
  const up = Array.from({ length: steps }, (_, i) => rest + ((peak - rest) * (i + 1)) / steps);
  return [...up, ...up.slice().reverse(), rest, rest];
}

function armRaiseTracker() {
  return new ExerciseTracker({
    exercise: requireExercise("arm_raise") as MotorExercise,
    level: 2, // 8 repetitions through 45°
    affectedSide: "left",
  });
}

function failedInference(): PoseFrame {
  return readPoseObservation(() => { throw new Error("Inference failed"); }).frame;
}

test("brief inference loss preserves measurements without inventing a repetition", () => {
  const tracker = armRaiseTracker();
  let t = feed(tracker, [15, ...sweep(80), 15, 15]);
  const before = tracker.finish();
  assert.equal(before.valid_reps, 1);
  tracker.update(failedInference(), t);
  tracker.update(failedInference(), t + 200);
  assert.deepEqual(tracker.finish(), before);
  t = feed(tracker, [15, ...sweep(80), 15, 15], t + 300);
  assert.equal(tracker.finish().valid_reps, 2);
  assert.deepEqual(tracker.finish().reps[0], before.reps[0]);
  assert.equal(tracker.update(shoulderAt(15), t).trackingValid, true);
});

test("prolonged inference loss warns, abandons the attempt and recovers after rest", () => {
  const tracker = armRaiseTracker();
  const t = feed(tracker, [15, 15, 30, 45, 60, 80, 80]);
  tracker.update(failedInference(), t);
  const warning = tracker.update(failedInference(), t + 700);
  assert.equal(warning.trackingValid, false);
  assert.match(String(warning.guidance), /picture/);
  const paused = tracker.update(failedInference(), t + 3000);
  assert.equal(paused.phase, "waiting");
  assert.match(String(paused.guidance), /paused/);
  assert.equal(tracker.finish().reps.length, 0);
  assert.equal(tracker.finish().invalid_segments, 1);
  const recoveredAt = feed(tracker, [80, 80, 15, 15, 15, 15, 15, 15], t + 3100);
  assert.equal(tracker.finish().reps.length, 0);
  feed(tracker, [15, ...sweep(80), 15, 15], recoveredAt);
  assert.equal(tracker.finish().valid_reps, 1);
});

test("a failed observation during a movement does not enter its angle or confidence metrics", () => {
  const tracker = armRaiseTracker();
  const control = armRaiseTracker();
  let t = 0;
  for (const angle of [15, 15, ...sweep(80), 15, 15]) {
    tracker.update(shoulderAt(angle), t);
    control.update(shoulderAt(angle), t);
    // Only the tracker sees the failed inference between good observations.
    if (t === 198) tracker.update(failedInference(), t + 10);
    t += 33;
  }
  assert.equal(tracker.finish().valid_reps, 1);
  assert.deepEqual(tracker.finish(), control.finish());
});

test("the count never runs past what the level asked for", () => {
  const tracker = armRaiseTracker();
  const target = tracker.targetRepCount;

  // Twice as many full movements as the level asks for. A patient who keeps
  // going, or a definition that mis-reads a movement, must not be able to
  // drive the number up without limit.
  let t = 0;
  for (let i = 0; i < target * 2; i += 1) {
    t = feed(tracker, sweep(70), t);
  }

  const result = tracker.finish();
  assert.ok(
    result.valid_reps <= target,
    `counted ${result.valid_reps} valid reps against a target of ${target}`,
  );
  assert.equal(result.reps.length, target);
});

test("the exercise reports itself complete once the target is met", () => {
  const tracker = armRaiseTracker();
  let t = 0;
  for (let i = 0; i < tracker.targetRepCount; i += 1) {
    t = feed(tracker, sweep(70), t);
  }
  assert.equal(tracker.isComplete, true);
});

test("failed attempts remain recorded without completing the exercise", () => {
  const tracker = armRaiseTracker();

  // Every movement falls well short of the 45° target.
  let t = 0;
  for (let i = 0; i < 40; i += 1) {
    t = feed(tracker, sweep(32), t);
  }

  assert.equal(tracker.isComplete, false);
  const result = tracker.finish("stopped_early");
  assert.equal(result.valid_reps, 0);
  assert.equal(result.reps.length, 40);
  assert.ok(result.reps.every((rep) => !rep.valid));
});

test("valid repetitions complete the exercise even after many short attempts", () => {
  const tracker = armRaiseTracker();
  let t = 0;
  for (let i = 0; i < 12; i += 1) t = feed(tracker, sweep(32), t);
  for (let i = 1; i <= tracker.targetRepCount; i += 1) {
    t = feed(tracker, sweep(70), t);
    assert.equal(tracker.validRepCount, i);
    assert.equal(tracker.isComplete, i === tracker.targetRepCount);
  }
  const result = tracker.finish();
  assert.equal(result.reps.length, 12 + result.target_reps);
  assert.equal(result.reps.filter((rep) => !rep.valid).length, 12);
});

test("starting already past the target does not mint a repetition", () => {
  const tracker = armRaiseTracker();

  // The person is discovered with their arm already raised — a definition
  // whose resting angle does not match how they actually sit would look like
  // this on every frame. Holding still there is not a repetition.
  let t = feed(tracker, Array.from({ length: 60 }, () => 80));
  const afterHolding = tracker.finish();
  assert.equal(afterHolding.reps.length, 0, "holding a raised arm is not a repetition");

  // Nor is lowering the arm on its own: the first real repetition has to
  // start from rest.
  const fresh = armRaiseTracker();
  t = feed(fresh, Array.from({ length: 30 }, () => 80));
  feed(fresh, [60, 45, 30, 15, 15, 15], t);
  assert.equal(fresh.finish().reps.length, 0, "returning to rest is not a repetition");
});

test("a limb pointing at the camera is reported as untracked, not measured", () => {
  const tracker = armRaiseTracker();

  // Settle at rest so the counter is armed and tracking is established.
  feed(tracker, Array.from({ length: 20 }, () => 15));

  let t = 660;
  let last = null;
  for (let i = 0; i < 60; i += 1) {
    last = tracker.update(armTowardsCamera(), t);
    t += 33;
  }

  assert.ok(last);
  assert.equal(last.trackingValid, false, "an end-on limb must not read as tracked");
  assert.equal(last.validReps, 0, "and must not produce repetitions");
  assert.match(String(last.guidance), /side/i);
});

test("unreliable repetitions do not contribute to ROM statistics", () => {
  const tracker = armRaiseTracker();
  let t = 0;

  const lowConfidenceFrame = (angle: number): PoseFrame => {
    const frame = shoulderAt(angle);

    return {
      ...frame,
      left_hip: { ...frame.left_hip!, visibility: 0.55 },
      left_shoulder: { ...frame.left_shoulder!, visibility: 0.55 },
      left_elbow: { ...frame.left_elbow!, visibility: 0.55 },
    };
  };

  for (const angle of [15, 15, ...sweep(80), 15, 15]) {
    tracker.update(lowConfidenceFrame(angle), t);
    t += 33;
  }

  const result = tracker.finish();

  assert.equal(result.valid_reps, 0);
  assert.equal(result.reps.length, 1);
  assert.equal(result.rom_mean_deg, 0);
  assert.equal(result.rom_min_deg, 0);
  assert.equal(result.rom_max_deg, 0);
});
