/**
 * The safety watcher, tested mostly on what must NOT alert.
 *
 * A fall detector that fires when somebody sits down, bends over, or walks out
 * of shot would be switched off within a day, and a practitioner who has
 * learned to ignore it would miss the real one.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SafetyWatcher } from "@/lib/cv/safety";
import type { PoseFrame } from "@/lib/contracts";

/**
 * A body at a given height and tilt.
 *
 * `headY` is position down the frame, 0 at the top.
 *
 * Upright stands the spine on end: head, then shoulders, then hips, each below
 * the last. Horizontal lays it across the picture — head, shoulders and hips at
 * the same height, spread sideways instead — because that is what lying down
 * actually looks like, and because the watcher now refuses to measure a body
 * whose landmarks are outside the frame. The earlier version of this helper
 * kept the hips a quarter of the frame below the head even when horizontal,
 * which put them off the bottom of the picture for any pose low enough to be a
 * fall, and made these tests pass on coordinates MediaPipe had extrapolated
 * rather than seen.
 */
function body(headY: number, tilt: "upright" | "horizontal"): PoseFrame {
  const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 0.95 });

  if (tilt === "upright") {
    return {
      nose: point(0.5, headY),
      left_shoulder: point(0.42, headY + 0.1),
      right_shoulder: point(0.58, headY + 0.1),
      left_hip: point(0.42, headY + 0.25),
      right_hip: point(0.58, headY + 0.25),
    };
  }

  // Lying: the spine runs left to right, so the shoulders and hips spread up
  // and down the frame rather than across it.
  return {
    nose: point(0.25, headY),
    left_shoulder: point(0.45, headY - 0.08),
    right_shoulder: point(0.45, headY + 0.08),
    left_hip: point(0.75, headY - 0.06),
    right_hip: point(0.75, headY + 0.06),
  };
}

/**
 * A fall that carries the body out of the bottom of the picture, sampled the
 * way the watcher really sees one: a few frames on the way down while still in
 * shot, then coordinates below the frame that MediaPipe goes on reporting.
 */
function fallOutOfShot(watcher: SafetyWatcher, fromMs: number, thenGoneForMs: number) {
  let alert = null;
  let t = fromMs;

  // 800ms of descent, the head dropping towards the bottom edge while still in
  // shot. This is the part the watcher has to see: the drop is the evidence.
  for (let step = 0; step < 4; step += 1, t += 200) {
    const raised = watcher.update(body(0.3 + step * 0.2, "upright"), t);
    if (raised && !alert) alert = raised;
  }

  // Below the picture. The landmarks keep coming, extrapolated and upright.
  const backAt = t + thenGoneForMs;
  for (; t <= backAt; t += 200) {
    const raised = watcher.update(body(1.15, "upright"), t);
    if (raised && !alert) alert = raised;
  }
  return alert;
}

/** Feed the same posture for a stretch of time, at 5Hz. */
function hold(watcher: SafetyWatcher, frame: PoseFrame, fromMs: number, forMs: number) {
  let alert = null;
  for (let t = fromMs; t <= fromMs + forMs; t += 200) {
    const raised = watcher.update(frame, t);
    if (raised && !alert) alert = raised;
  }
  return alert;
}

test("sitting still raises nothing", () => {
  const watcher = new SafetyWatcher();
  assert.equal(hold(watcher, body(0.3, "upright"), 0, 30_000), null);
});

test("sitting down quickly is not a fall", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.2, "upright"), 0, 2000);
  // Drops fast, but ends up upright and only part way down the frame.
  const alert = hold(watcher, body(0.45, "upright"), 2200, 20_000);
  assert.equal(alert, null);
});

test("bending down to pick something up is not a fall", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.2, "upright"), 0, 2000);
  // Low and folded over, but back up within a couple of seconds.
  hold(watcher, body(0.65, "horizontal"), 2200, 1800);
  const alert = hold(watcher, body(0.2, "upright"), 4200, 10_000);
  assert.equal(alert, null);
});

test("leaving the room is not an emergency", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 2000);
  let alert = null;
  for (let t = 2200; t < 40_000; t += 200) {
    const raised = watcher.update({}, t);
    if (raised && !alert) alert = raised;
  }
  assert.ok(alert, "an absence should eventually be mentioned");
  assert.equal(alert.kind, "tracking_lost");
  // The point of the test: mentioned quietly, not as an emergency.
  assert.equal(alert.severity, "info");
});

test("a fast drop followed by lying still raises an urgent alert", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.2, "upright"), 0, 2000);
  // Down through a third of the frame in under a second, then motionless.
  const alert = hold(watcher, body(0.78, "horizontal"), 2600, 8000);
  assert.ok(alert, "a fall should raise something");
  assert.equal(alert.kind, "possible_fall");
  assert.equal(alert.severity, "urgent");
  assert.equal(alert.evidence.still, true);
});

test("getting back up after a fall does not alert", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.2, "upright"), 0, 2000);
  // Goes down fast, but is moving and back up inside three seconds.
  hold(watcher, body(0.78, "horizontal"), 2600, 1500);
  const alert = hold(watcher, body(0.25, "upright"), 4300, 10_000);
  assert.equal(alert, null);
});

test("a long time low and still alerts, but only for attention", () => {
  const watcher = new SafetyWatcher();
  // No fast descent is ever seen: the watcher starts with the person already
  // down, as it would if the fall happened off camera.
  const alert = hold(watcher, body(0.8, "horizontal"), 0, 15_000);
  assert.ok(alert);
  assert.equal(alert.kind, "prolonged_floor_position");
  assert.equal(alert.severity, "attention");
});

test("one event raises one alert, not one per frame", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.2, "upright"), 0, 2000);
  let count = 0;
  for (let t = 2600; t < 30_000; t += 200) {
    if (watcher.update(body(0.78, "horizontal"), t)) count += 1;
  }
  assert.equal(count, 1);
});


/* ---- A fall the camera cannot follow all the way down ------------------ */

/*
 * A camera on a desk cannot see the floor. The tests above describe a fall that
 * stays in shot, which is the view a tripod at floor level would give; in front
 * of a laptop the person leaves the bottom of the picture on the way down. That
 * case reported nothing at all, because MediaPipe goes on reporting an
 * extrapolated body below the frame — upright, confident, off the bottom of the
 * screen — so the watcher saw neither a horizontal body nor an absent one.
 */

test("falling out of the bottom of the picture raises a fall, not a shrug", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 3000);
  const alert = fallOutOfShot(watcher, 3200, 12_000);
  assert.ok(alert, "dropping out of shot must raise something");
  assert.equal(alert.kind, "fall_out_of_view");
  assert.equal(alert.severity, "urgent");
});

test("the evidence says how far they dropped and how long they have been gone", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 3000);
  const alert = fallOutOfShot(watcher, 3200, 12_000);
  assert.ok(alert);
  assert.ok((alert.evidence.head_drop_fraction as number) >= 0.22);
  assert.ok((alert.evidence.out_of_view_for_ms as number) >= 8000);
  assert.equal(typeof alert.evidence.head_y_when_last_seen, "number");
});

test("it waits: a disappearance is not a fall in the first few seconds", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 3000);
  assert.equal(fallOutOfShot(watcher, 3200, 3000), null);
});

test("walking out of shot is still only a mention", () => {
  const watcher = new SafetyWatcher();
  // Upright the whole time, then simply not there: no drop, nothing low.
  hold(watcher, body(0.25, "upright"), 0, 3000);
  const gone = {} as PoseFrame;
  const alert = hold(watcher, gone, 3200, 40_000);
  assert.ok(alert);
  assert.equal(alert.kind, "tracking_lost");
  assert.equal(alert.severity, "info");
});

test("ducking out of shot and coming back raises nothing", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 3000);
  // Down fast and out of the picture, but back up within a few seconds.
  fallOutOfShot(watcher, 3200, 3000);
  const alert = hold(watcher, body(0.3, "upright"), 10_000, 40_000);
  assert.equal(alert, null);
});

test("one disappearance raises one alert, and no absence note after it", () => {
  const watcher = new SafetyWatcher();
  hold(watcher, body(0.3, "upright"), 0, 3000);
  let count = 0;
  let t = 3200;
  for (let step = 0; step < 4; step += 1, t += 200) {
    if (watcher.update(body(0.3 + step * 0.2, "upright"), t)) count += 1;
  }
  for (; t < 60_000; t += 200) {
    if (watcher.update(body(1.15, "upright"), t)) count += 1;
  }
  assert.equal(count, 1);
});
