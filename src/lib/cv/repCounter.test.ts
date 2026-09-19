/**
 * The repetition counter, driven by synthetic angle traces.
 *
 * The cases that matter are the ones where a naive threshold counter goes
 * wrong: jitter at rest, a movement that stops short, and tracking dropping out
 * mid-repetition.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RepCounter } from "@/lib/cv/repCounter";

/** Rising from a 15° rest towards a 60° sweep, like an arm raise. */
function armRaiseCounter(holdSeconds = 0, targetReps = 10) {
  return new RepCounter({
    restAngleDeg: 15,
    direction: "increasing",
    targetRomDeg: 60,
    holdSeconds,
    targetReps,
  });
}

/** Feed a list of angles at 30fps and collect the reps that completed. */
function run(counter: RepCounter, angles: number[], confidence = 0.9, startMs = 0) {
  const reps = [];
  let t = startMs;
  for (const angle of angles) {
    const rep = counter.update(angle, confidence, t);
    if (rep) reps.push(rep);
    t += 33;
  }
  return reps;
}

/** A full out-and-back sweep from rest to `peak` and down again. */
function cycle(peak: number, rest = 15, steps = 12): number[] {
  const up = Array.from({ length: steps }, (_, i) => rest + ((peak - rest) * (i + 1)) / steps);
  return [...up, ...up.slice().reverse(), rest];
}

test("a full movement counts as one valid repetition", () => {
  const counter = armRaiseCounter();
  const reps = run(counter, cycle(78));
  assert.equal(reps.length, 1);
  assert.equal(reps[0].valid, true);
  // ROM is the sweep from rest, not the raw angle.
  assert.ok(reps[0].rom_deg >= 60, `expected at least 60°, got ${reps[0].rom_deg}`);
});

test("jitter at rest counts nothing", () => {
  const counter = armRaiseCounter();
  // Three degrees of noise around the resting angle, for two seconds.
  const noise = Array.from({ length: 60 }, (_, i) => 15 + Math.sin(i) * 3);
  assert.equal(run(counter, noise).length, 0);
});

test("crossing the start threshold and stopping is not a repetition", () => {
  const counter = armRaiseCounter();
  // Lifts a little, hovers, comes back. Never near the target.
  const reps = run(counter, [...cycle(30)]);
  // It completed a cycle, so it is recorded as an attempt...
  assert.equal(reps.length, 1);
  // ...but not as a valid repetition, because it never reached the range.
  assert.equal(reps[0].valid, false);
});

test("three movements count as three, not six", () => {
  const counter = armRaiseCounter();
  const reps = run(counter, [...cycle(80), ...cycle(80), ...cycle(80)]);
  assert.equal(reps.length, 3);
  assert.equal(counter.validRepCount, 3);
});

test("a hold must actually be held", () => {
  // Reaches the target and comes straight back down without holding. The
  // movement happened, so it is recorded — but it is not a completed rep.
  const rushed = run(armRaiseCounter(2), cycle(80));
  assert.equal(rushed.length, 1);
  assert.equal(rushed[0].valid, false);

  // The same movement, held at the top for the two seconds the level asks for.
  const held = run(armRaiseCounter(2), [
    ...cycle(80).slice(0, 12),
    ...Array.from({ length: 70 }, () => 80),
    40,
    20,
    15,
  ]);
  assert.equal(held.length, 1);
  assert.equal(held[0].valid, true);
});

test("a repetition measured through a tracking dropout is not counted as valid", () => {
  const counter = armRaiseCounter();
  const angles = cycle(80);
  let t = 0;
  let completed = null;
  for (const [index, angle] of angles.entries()) {
    // Tracking is lost part way up.
    if (index === 6) counter.markTrackingLost();
    const rep = counter.update(angle, 0.9, t);
    if (rep) completed = rep;
    t += 33;
  }
  assert.ok(completed);
  assert.equal(completed.valid, false);
});

test("low confidence throughout makes a full movement invalid", () => {
  const counter = armRaiseCounter();
  const reps = run(counter, cycle(80), 0.3);
  assert.equal(reps.length, 1);
  assert.equal(reps[0].valid, false);
});

test("a closing joint is measured the same way as an opening one", () => {
  // An elbow bend: 170° at rest, closing to about 80°, an 80° sweep.
  const counter = new RepCounter({
    restAngleDeg: 170,
    direction: "decreasing",
    targetRomDeg: 80,
    holdSeconds: 0,
    targetReps: 10,
  });
  const down = Array.from({ length: 12 }, (_, i) => 170 - (90 * (i + 1)) / 12);
  const reps = run(counter, [...down, ...down.slice().reverse(), 170]);
  assert.equal(reps.length, 1);
  assert.equal(reps[0].valid, true);
});

test("nothing is counted until the joint has been seen at rest", () => {
  const counter = armRaiseCounter();

  // The person is already past the target when tracking starts. Holding there
  // and then coming down is not a repetition: it never had a beginning.
  run(counter, Array.from({ length: 40 }, () => 80));
  assert.equal(counter.completedReps.length, 0);
  assert.equal(counter.isArmed, false);

  // Returning to rest arms the counter, and the next full movement counts.
  run(counter, [40, 20, 15, 15], 0.9, 1400);
  assert.equal(counter.isArmed, true);
  const reps = run(counter, cycle(80), 0.9, 1600);
  assert.equal(reps.length, 1);
});

test("the counter stops recording once the allowance is spent", () => {
  const counter = armRaiseCounter(0, 3);

  // Ten short movements against a target of three. Three attempts are allowed
  // beyond the target at most, so recording must stop at five.
  let t = 0;
  for (let i = 0; i < 10; i += 1) {
    run(counter, cycle(35), 0.9, t);
    t += 2000;
  }

  assert.ok(counter.isFull);
  assert.ok(
    counter.completedReps.length <= 5,
    `recorded ${counter.completedReps.length} attempts against a target of 3`,
  );
});
