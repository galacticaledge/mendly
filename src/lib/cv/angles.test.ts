import assert from "node:assert/strict";
import test from "node:test";

import type { Landmark, PoseFrame } from "@/lib/contracts";
import { angleAt, angleFromFrame, rayLengths } from "@/lib/cv/angles";

function landmark(x: number, y: number): Landmark {
  return {
    x,
    y,
    z: 0,
    visibility: 1,
  };
}

test("angleAt keeps the old behavior when aspect ratio is 1", () => {
  const a = landmark(0.75, 0.75);
  const vertex = landmark(0.5, 0.25);
  const c = landmark(0.25, 0.75);

  const withoutAspectRatio = angleAt(a, vertex, c);
  const squareFrame = angleAt(a, vertex, c, 1);

  assert.ok(Math.abs(withoutAspectRatio - squareFrame) < 1e-9);
});

test("angleFromFrame corrects geometry for a rectangular frame", () => {
  /*
   * With aspectRatio = 2:
   *
   * normalized vectors:
   *   elbow -> shoulder = ( 0.25, 0.50)
   *   elbow -> wrist    = (-0.25, 0.50)
   *
   * aspect-corrected:
   *   ( 0.50, 0.50)
   *   (-0.50, 0.50)
   *
   * Those vectors are perpendicular, so the real image-plane angle is 90°.
   */
  const frame: PoseFrame = {
    left_shoulder: landmark(0.75, 0.75),
    left_elbow: landmark(0.5, 0.25),
    left_wrist: landmark(0.25, 0.75),
  };

  const angle = angleFromFrame(
    frame,
    "left_shoulder",
    "left_elbow",
    "left_wrist",
    2,
  );

  assert.notEqual(angle, null);
  assert.ok(Math.abs(angle! - 90) < 1e-9);
});

test("rayLengths applies the same aspect-ratio correction", () => {
  const frame: PoseFrame = {
    left_shoulder: landmark(0.75, 0.5),
    left_elbow: landmark(0.5, 0.5),
    left_wrist: landmark(0.5, 0.75),
  };

  const lengths = rayLengths(
    frame,
    "left_shoulder",
    "left_elbow",
    "left_wrist",
    2,
  );

  assert.notEqual(lengths, null);

  // Horizontal delta: 0.25 * aspect ratio 2 = 0.50
  assert.ok(Math.abs(lengths!.first - 0.5) < 1e-9);

  // Vertical delta is already normalized by frame height.
  assert.ok(Math.abs(lengths!.second - 0.25) < 1e-9);
});
