/**
 * Counting repetitions.
 *
 * A repetition is a cycle, not a threshold crossing (docs/03). Counting every
 * time the angle passes a number would add a rep each time a resting arm
 * wobbled across it. Instead the counter walks a small state machine and only
 * emits a repetition after a full out-and-back:
 *
 *     waiting ──movement starts──▶ rising ──target reached──▶ holding
 *        ▲                           │                           │
 *        │                           │ (came back down early)    │ hold done
 *        └───────returned to rest────┴──────────▶ returning ◀────┘
 *
 * Exercises differ in whether the measured angle grows or shrinks during the
 * effort — a shoulder opens as the arm lifts, an elbow closes as the hand comes
 * up. Rather than write the machine twice, every angle is converted to
 * `progress`: how far the joint has travelled from its resting angle in the
 * direction the exercise asks for. Progress always starts near zero and always
 * grows during effort, so one state machine covers both kinds.
 */

import type { RepMeasurement } from "@/lib/contracts";
import { mean } from "@/lib/cv/smoothing";

export type RepPhase = "waiting" | "rising" | "holding" | "returning";

export type RepCounterConfig = {
  /** Angle the joint sits at between repetitions, in degrees. */
  restAngleDeg: number;
  /** Which way the angle moves while the person is working. */
  direction: "increasing" | "decreasing";
  /** Progress from rest that a full repetition should reach, in degrees. */
  targetRomDeg: number;
  /** Seconds the end position must be held. 0 means no hold. */
  holdSeconds: number;
};

/**
 * Fraction of the target that counts as "started moving". Below this the joint
 * is treated as at rest, which absorbs both residual angle noise and the small
 * postural drift of somebody sitting still.
 */
const START_FRACTION = 0.2;
/** Progress must fall back under this fraction before the next rep can start. */
const RETURN_FRACTION = 0.25;
/** A rep counts as a full one at this fraction of target, allowing for lag. */
const VALID_FRACTION = 0.9;
/** Progress may sag to this fraction of target during a hold without failing it. */
const HOLD_FRACTION = 0.85;
/** Below this mean confidence, a completed rep is recorded but not counted. */
const MIN_REP_CONFIDENCE = 0.6;
/** Floor for the start/return thresholds, so tiny targets stay above noise. */
const MIN_THRESHOLD_DEG = 5;

export class RepCounter {
  private phase: RepPhase = "waiting";
  private peakProgress = 0;
  private repStartedAt = 0;
  private holdStartedAt: number | null = null;
  private confidenceSamples: number[] = [];
  /** Set when tracking drops mid-repetition; the rep is reported unreliable. */
  private repTainted = false;
  /**
   * Whether this repetition's hold was actually completed. An exercise that
   * asks for a three-second hold is not done by touching the end position and
   * coming straight back, so reaching the angle is not enough on its own.
   */
  private holdSatisfied = false;
  private reps: RepMeasurement[] = [];

  constructor(private readonly config: RepCounterConfig) {}

  private get startThreshold(): number {
    return Math.max(MIN_THRESHOLD_DEG, this.config.targetRomDeg * START_FRACTION);
  }

  private get returnThreshold(): number {
    return Math.max(MIN_THRESHOLD_DEG, this.config.targetRomDeg * RETURN_FRACTION);
  }

  /**
   * Distance travelled from rest in the working direction, in degrees.
   * Negative values mean the joint moved the other way, which is not effort,
   * so they are floored at zero.
   */
  progressFor(angleDeg: number): number {
    const delta =
      this.config.direction === "increasing"
        ? angleDeg - this.config.restAngleDeg
        : this.config.restAngleDeg - angleDeg;
    return Math.max(0, delta);
  }

  /**
   * Advance the machine by one frame.
   *
   * @param angleDeg   smoothed joint angle
   * @param confidence tracking confidence for this frame, 0–1
   * @param nowMs      frame timestamp in milliseconds
   * @returns the repetition that just completed, or null
   */
  update(angleDeg: number, confidence: number, nowMs: number): RepMeasurement | null {
    const progress = this.progressFor(angleDeg);
    const { targetRomDeg, holdSeconds } = this.config;

    if (this.phase !== "waiting") {
      this.confidenceSamples.push(confidence);
    }

    switch (this.phase) {
      case "waiting": {
        if (progress >= this.startThreshold) {
          this.phase = "rising";
          this.peakProgress = progress;
          this.repStartedAt = nowMs;
          this.confidenceSamples = [confidence];
          this.repTainted = false;
          this.holdSatisfied = false;
        }
        return null;
      }

      case "rising": {
        this.peakProgress = Math.max(this.peakProgress, progress);

        if (progress >= targetRomDeg) {
          if (holdSeconds > 0) {
            this.phase = "holding";
            this.holdStartedAt = nowMs;
          } else {
            // Nothing to hold, so the movement requirement is met on arrival.
            this.holdSatisfied = true;
            this.phase = "returning";
          }
          return null;
        }

        // The person came back down without reaching the target. That is still
        // an attempt worth recording — it is how the AI learns the level is too
        // high — so the cycle moves on to its return leg rather than being
        // thrown away.
        if (progress < this.peakProgress * 0.5 && this.peakProgress >= this.startThreshold) {
          this.phase = "returning";
        }
        return null;
      }

      case "holding": {
        this.peakProgress = Math.max(this.peakProgress, progress);

        // Sagging out of the end position restarts the hold rather than
        // failing the rep, so a small wobble does not cost the whole effort.
        if (progress < targetRomDeg * HOLD_FRACTION) {
          this.phase = "rising";
          this.holdStartedAt = null;
          return null;
        }

        if (this.holdStartedAt !== null && nowMs - this.holdStartedAt >= holdSeconds * 1000) {
          this.holdSatisfied = true;
          this.phase = "returning";
          this.holdStartedAt = null;
        }
        return null;
      }

      case "returning": {
        if (progress > this.returnThreshold) return null;
        return this.completeRep(nowMs);
      }
    }
  }

  private completeRep(nowMs: number): RepMeasurement {
    const confidence = mean(this.confidenceSamples);
    const rom = this.peakProgress;

    const rep: RepMeasurement = {
      rep: this.reps.length + 1,
      rom_deg: Math.round(rom * 10) / 10,
      duration_s: Math.round(((nowMs - this.repStartedAt) / 1000) * 10) / 10,
      // A repetition is valid when it reached the range asked for, held the end
      // position for as long as the level asks, and was seen well enough
      // throughout. All three have to hold: a confident measurement of a short
      // movement, a full movement nobody could see, and a hold that was never
      // held are different problems, and none of them is a completed rep.
      valid:
        rom >= this.config.targetRomDeg * VALID_FRACTION &&
        this.holdSatisfied &&
        confidence >= MIN_REP_CONFIDENCE &&
        !this.repTainted,
      tracking_confidence: Math.round(confidence * 100) / 100,
    };

    this.reps.push(rep);
    this.phase = "waiting";
    this.peakProgress = 0;
    this.confidenceSamples = [];
    this.repTainted = false;
    this.holdSatisfied = false;
    return rep;
  }

  /**
   * Tracking was lost. Any repetition in progress keeps its state but is
   * marked unreliable, because we cannot know what the body did during the
   * gap — it may have reached the target, or stopped entirely.
   */
  markTrackingLost(): void {
    if (this.phase !== "waiting") this.repTainted = true;
  }

  /**
   * Abandon a repetition in progress without counting it. Used when tracking
   * has been gone long enough that the attempt cannot be salvaged.
   */
  abandonCurrentRep(): void {
    this.phase = "waiting";
    this.peakProgress = 0;
    this.confidenceSamples = [];
    this.repTainted = false;
    this.holdSatisfied = false;
    this.holdStartedAt = null;
  }

  /** Seconds left on the current hold, or 0 when not holding. */
  holdRemaining(nowMs: number): number {
    if (this.phase !== "holding" || this.holdStartedAt === null) return 0;
    const elapsed = (nowMs - this.holdStartedAt) / 1000;
    return Math.max(0, Math.round((this.config.holdSeconds - elapsed) * 10) / 10);
  }

  get currentPhase(): RepPhase {
    return this.phase;
  }

  get completedReps(): RepMeasurement[] {
    return this.reps;
  }

  get validRepCount(): number {
    return this.reps.filter((rep) => rep.valid).length;
  }
}
