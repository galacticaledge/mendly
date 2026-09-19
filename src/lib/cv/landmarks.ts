/**
 * From MediaPipe's output to named landmarks.
 *
 * MediaPipe Pose returns 33 points in a fixed order. Exercise definitions refer
 * to landmarks by name, so this file holds the one mapping between the two and
 * nothing else depends on the index numbers.
 *
 * Coordinates are normalised: x and y run 0–1 across the video frame, z is
 * depth relative to the hips. `visibility` is MediaPipe's own estimate that the
 * point is actually visible rather than inferred from the rest of the body —
 * which is why it, and not the coordinate, is what tells us to stop counting.
 */

import type { Landmark, PoseFrame, PoseLandmarkName } from "@/lib/contracts";

/** Index of each landmark we use in MediaPipe's 33-point pose model. */
export const LANDMARK_INDEX: Record<PoseLandmarkName, number> = {
  nose: 0,
  left_eye: 2,
  right_eye: 5,
  left_ear: 7,
  right_ear: 8,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot_index: 31,
  right_foot_index: 32,
};

/** Below this, MediaPipe is guessing where the point is rather than seeing it. */
export const MIN_VISIBILITY = 0.5;

type RawLandmark = { x: number; y: number; z?: number; visibility?: number };

/** Pull the landmarks we care about out of a MediaPipe result. */
export function toPoseFrame(raw: RawLandmark[] | undefined): PoseFrame {
  if (!raw || raw.length === 0) return {};
  const frame: PoseFrame = {};
  for (const [name, index] of Object.entries(LANDMARK_INDEX) as [PoseLandmarkName, number][]) {
    const point = raw[index];
    if (!point) continue;
    frame[name] = {
      x: point.x,
      y: point.y,
      z: point.z ?? 0,
      visibility: point.visibility ?? 0,
    };
  }
  return frame;
}

/**
 * Mirror a landmark name to the other side of the body.
 *
 * Exercise definitions are written for the left side; a patient whose right
 * side is affected does the same movement with the other arm, and the
 * measurement has to follow them. Names without a side are returned unchanged.
 */
export function mirrorLandmark(name: PoseLandmarkName): PoseLandmarkName {
  if (name.startsWith("left_")) return name.replace("left_", "right_") as PoseLandmarkName;
  if (name.startsWith("right_")) return name.replace("right_", "left_") as PoseLandmarkName;
  return name;
}

/** Whether a landmark can be trusted this frame. */
export function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark !== undefined && landmark.visibility >= MIN_VISIBILITY;
}

/**
 * How well the frame shows the landmarks an exercise needs, 0–1.
 *
 * The mean of the required landmarks' visibility, or 0 if any one of them is
 * missing outright. A mean is right here rather than a minimum: one briefly
 * uncertain point among three should lower confidence, not zero it, and the
 * validity check below is what stops counting when a point really is gone.
 */
export function frameConfidence(frame: PoseFrame, required: PoseLandmarkName[]): number {
  if (required.length === 0) return 0;
  let total = 0;
  for (const name of required) {
    const landmark = frame[name];
    if (!landmark) return 0;
    total += landmark.visibility;
  }
  return total / required.length;
}

/** Whether every landmark an exercise needs is visible enough to measure. */
export function frameIsValid(frame: PoseFrame, required: PoseLandmarkName[]): boolean {
  return required.every((name) => isVisible(frame[name]));
}

/**
 * Whether the body is inside the frame, with a small margin.
 *
 * MediaPipe still reports coordinates for a point that has left the picture,
 * extrapolated from the rest of the body, and those coordinates fall outside
 * 0–1. Treating them as measurements would produce a confident-looking angle
 * for an arm nobody can see.
 */
export function isInFrame(landmark: Landmark, margin = 0.02): boolean {
  return (
    landmark.x > margin && landmark.x < 1 - margin && landmark.y > margin && landmark.y < 1 - margin
  );
}
