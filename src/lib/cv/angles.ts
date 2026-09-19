/**
 * Joint angles.
 *
 * A joint angle is the angle at one landmark between the directions of two
 * others. For an elbow that is shoulder → elbow → wrist:
 *
 *     shoulder ----- elbow ----- wrist
 *                      ^
 *                 the vertex
 *
 * Build the two vectors that leave the vertex, take the angle between them
 * with the dot product, and convert to degrees. The result is always 0–180: a
 * fully straight arm is near 180°, a fully folded one near 0°.
 */

import type { Landmark, PoseFrame, PoseLandmarkName } from "@/lib/contracts";

type Vec2 = { x: number; y: number };

function vector(from: Landmark, to: Landmark, aspectRatio = 1): Vec2 {
  return {
    x: (to.x - from.x) * aspectRatio,
    y: to.y - from.y,
  };
}

function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * The angle at `vertex`, in degrees.
 *
 * This works in the image plane (x and y) and ignores depth. For a person
 * facing the camera that is the right call: z from a single webcam is the
 * least reliable of the three coordinates, and including it adds more noise to
 * the angle than the extra dimension removes. It does mean a movement aimed
 * straight at the lens measures short, which is what the setup check and the
 * on-screen framing guidance are for.
 */
export function angleAt(
  a: Landmark,
  vertex: Landmark,
  c: Landmark,
  aspectRatio = 1,
): number {
  const v1 = vector(vertex, a, aspectRatio);
  const v2 = vector(vertex, c, aspectRatio);

  const denominator = magnitude(v1) * magnitude(v2);
  if (denominator < 1e-6) return 0;

  const cosine = (v1.x * v2.x + v1.y * v2.y) / denominator;
  const clamped = Math.min(1, Math.max(-1, cosine));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * How long the two rays around the joint are in the image, as a fraction of
 * the frame.
 *
 * A limb pointing towards or away from the camera projects onto almost
 * nothing, and the angle it makes with anything else is then mostly noise —
 * a few pixels of jitter at the elbow swings the measured angle by tens of
 * degrees. Callers use this to tell "the arm is at 40°" apart from "the arm
 * is pointing at the lens and the number means nothing".
 */
export function rayLengths(
  frame: PoseFrame,
  from: PoseLandmarkName,
  vertex: PoseLandmarkName,
  to: PoseLandmarkName,
  aspectRatio = 1,
): { first: number; second: number } | null {
  const a = frame[from];
  const b = frame[vertex];
  const c = frame[to];
  if (!a || !b || !c) return null;

  return {
    first: magnitude(vector(b, a, aspectRatio)),
    second: magnitude(vector(b, c, aspectRatio)),
  };
}

/** The angle for a named landmark triple, or null if any point is missing. */
export function angleFromFrame(
  frame: PoseFrame,
  from: PoseLandmarkName,
  vertex: PoseLandmarkName,
  to: PoseLandmarkName,
  aspectRatio = 1,
): number | null {
  const a = frame[from];
  const b = frame[vertex];
  const c = frame[to];
  if (!a || !b || !c) return null;

  return angleAt(a, b, c, aspectRatio);
}
