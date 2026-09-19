/**
 * The setup check.
 *
 * Before a standing exercise, the camera has to be able to see the whole body:
 * a full-body exercise measured from a chest-up view produces numbers that look
 * fine and mean nothing. This samples a couple of seconds of frames and reports
 * whether the required view actually holds.
 *
 * This is a feasibility signal about the camera setup. It says the movement can
 * be measured here, not that it is safe for this person to do — that judgement
 * belongs to the practitioner, and it is why standing needs their permission in
 * the rules as well as passing this check (docs/06).
 */

import type {
  BodyView,
  EnvironmentAssessment,
  PoseFrame,
  PoseLandmarkName,
} from "@/lib/contracts";
import { isInFrame, isVisible } from "@/lib/cv/landmarks";

/** What each view needs to see. */
const REQUIRED: Record<BodyView, PoseLandmarkName[]> = {
  // Shoulders-up is enough for cognitive work and seated arm exercises.
  upper: ["nose", "left_shoulder", "right_shoulder"],
  // A standing exercise needs the legs, or there is nothing to measure.
  full: [
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ],
};

/** Fraction of sampled frames that must satisfy the view. */
const PASS_FRACTION = 0.8;

export class EnvironmentChecker {
  private passed = 0;
  private total = 0;
  /** Counted separately so the advice can name the actual problem. */
  private missedLegs = 0;
  private outOfFrame = 0;
  private readonly required: PoseLandmarkName[];

  /**
   * @param view     how much of the body the exercise needs in shot
   * @param measured the landmarks this exercise actually measures
   *
   * Both matter, and checking only the first was a real bug: the "upper" view
   * is the head and shoulders, so a seated arm exercise could pass the setup
   * check with the arm entirely out of frame, tell the patient the camera was
   * ready, and then fail to track anything. The check now has to see what is
   * about to be measured.
   */
  constructor(
    private readonly view: BodyView,
    measured: PoseLandmarkName[] = [],
  ) {
    this.required = [...new Set([...REQUIRED[view], ...measured])];
  }

  /** Feed a frame. Call for about two seconds before reading the result. */
  update(frame: PoseFrame): void {
    this.total += 1;
    const required = this.required;

    const allVisible = required.every((name) => isVisible(frame[name]));
    const invisible = required.filter((name) => !isVisible(frame[name]));

    if (invisible.length > 0) {
      console.log(
        "Environment check invisible landmarks:",
        invisible.map((name) => ({
          name,
          visibility: frame[name]?.visibility,
        })),
      );
    }
    const allInFrame = required.every((name) => {
      const landmark = frame[name];
      return landmark !== undefined && isInFrame(landmark);
    });

    if (allVisible && allInFrame) {
      this.passed += 1;
      return;
    }

    const legsGone = [
      "left_knee",
      "right_knee",
      "left_ankle",
      "right_ankle",
    ].some((name) => !isVisible(frame[name as PoseLandmarkName]));
    if (legsGone) this.missedLegs += 1;
    else if (!allInFrame) this.outOfFrame += 1;
  }

  get sampleCount(): number {
    return this.total;
  }

  result(): EnvironmentAssessment {
    const confidence = this.total === 0 ? 0 : this.passed / this.total;
    const feasible = confidence >= PASS_FRACTION;

    let advice: string | null = null;
    if (!feasible) {
      if (this.view === "full" && this.missedLegs >= this.outOfFrame) {
        advice =
          "Move the camera back, or set it further away, so your legs and feet are in the picture.";
      } else if (this.outOfFrame > 0) {
        advice =
          this.view === "full"
            ? "Move so your whole body is inside the picture."
            : "Move so your head, shoulders and the arm you are using are all in the picture.";
      } else {
        advice =
          "The camera cannot see you clearly. Try turning on a light or facing the camera.";
      }
    }

    return {
      view: this.view,
      feasible,
      confidence: Math.round(confidence * 100) / 100,
      advice,
    };
  }
}

/** The view an exercise needs, for callers that only have the posture. */
export function viewForPosture(posture: "seated" | "standing"): BodyView {
  return posture === "standing" ? "full" : "upper";
}
