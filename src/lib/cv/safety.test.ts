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
 * `headY` is position down the frame, 0 at the top. `tilt` spreads the
 * shoulders sideways from the hips, which is how a horizontal torso reads.
 */
function body(headY: number, tilt: "upright" | "horizontal"): PoseFrame {
  const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 0.95 });
  const hipY = headY + 0.25;
  // Upright: shoulders directly above the hips. Horizontal: well off to one
  // side, which is what lying down looks like from the front.
  const shoulderX = tilt === "upright" ? 0.5 : 0.85;
  const shoulderY = tilt === "upright" ? headY + 0.1 : hipY;

  return {
    nose: point(0.5, headY),
    left_shoulder: point(shoulderX - 0.08, shoulderY),
    right_shoulder: point(shoulderX + 0.08, shoulderY),
    left_hip: point(0.42, hipY),
    right_hip: point(0.58, hipY),
  };
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
