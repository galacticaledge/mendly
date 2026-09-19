import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { PoseFrame } from "@/lib/contracts";
import { toPoseFrame } from "@/lib/cv/landmarks";

/** One inference attempt, including failures, becomes one tracking observation. */
export function readPoseObservation(detect: () => unknown): {
  frame: PoseFrame;
  raw: NormalizedLandmark[];
} {
  try {
    const result = detect() as { landmarks?: unknown[][] } | null | undefined;
    const raw = result?.landmarks?.[0];
    // Pose returns 33 landmarks. Reject incomplete or non-finite output before
    // it can poison smoothing or confidence. Visibility/framing thresholds
    // remain the tracker's responsibility.
    if (Array.isArray(raw) && raw.length === 33 && Array.from(raw).every(isLandmark)) {
      const landmarks = raw as NormalizedLandmark[];
      return { frame: toPoseFrame(landmarks), raw: landmarks };
    }
  } catch {
    // An inference exception is lost tracking, not a missing callback.
  }
  return { frame: {}, raw: [] };
}

function isLandmark(value: unknown): value is NormalizedLandmark {
  if (typeof value !== "object" || value === null) return false;
  const point = value as NormalizedLandmark;
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    Number.isFinite(point.visibility) &&
    point.visibility >= 0 && point.visibility <= 1
  );
}
