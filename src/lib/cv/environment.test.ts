import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PoseFrame } from "@/lib/contracts";
import { EnvironmentChecker } from "@/lib/cv/environment";

function upperFrame(visibility: number): PoseFrame {
  return {
    nose: { x: 0.5, y: 0.2, z: 0, visibility },
    left_shoulder: { x: 0.4, y: 0.4, z: 0, visibility },
    right_shoulder: { x: 0.6, y: 0.4, z: 0, visibility },
  } as PoseFrame;
}

test("environment check recovers after recent frames become good", () => {
  const checker = new EnvironmentChecker("upper");

  // Start with two seconds of bad setup.
  for (let i = 0; i < 60; i += 1) {
    checker.update(upperFrame(0.1));
  }

  assert.equal(checker.result().feasible, false);

  // Patient repositions correctly for the next two seconds.
  for (let i = 0; i < 60; i += 1) {
    checker.update(upperFrame(0.95));
  }

  assert.equal(checker.result().feasible, true);
});
