import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readPoseObservation } from "@/lib/cv/inference";

const pose = () => Array.from({ length: 33 }, () => ({
  x: 0.5, y: 0.5, z: 0, visibility: 0.95,
}));

test("inference exceptions and unusable results produce invalid observations", () => {
  const malformed = pose();
  malformed[13].visibility = NaN;
  const nonFinite = pose();
  nonFinite[13].x = Infinity;
  for (const result of [undefined, null, {}, { landmarks: [] },
    { landmarks: [[]] }, { landmarks: [pose().slice(0, 15)] },
    { landmarks: [malformed] }, { landmarks: [nonFinite] },
    { landmarks: [new Array(33)] }]) {
    assert.deepEqual(readPoseObservation(() => result), { frame: {}, raw: [] });
  }
  assert.deepEqual(readPoseObservation(() => { throw new Error("Inference failed"); }),
    { frame: {}, raw: [] });
});

test("valid inference remains usable after failure and retains tracker validation inputs", () => {
  const raw = pose();
  raw[13].visibility = 0.1;
  raw[15].x = 1.1;
  const before = readPoseObservation(() => ({ landmarks: [raw] }));
  readPoseObservation(() => { throw new Error("Inference failed"); });
  const after = readPoseObservation(() => ({ landmarks: [raw] }));
  assert.deepEqual(after, before);
  assert.equal(after.raw, raw);
  assert.equal(after.frame.left_elbow?.visibility, 0.1);
  assert.equal(after.frame.left_wrist?.x, 1.1);
});
