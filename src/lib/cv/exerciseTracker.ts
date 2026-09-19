/**
 * Tracking one motor exercise from start to finish.
 *
 * This is the piece that joins the rest of the CV layer together. It takes a
 * frame of landmarks, decides whether it can be trusted, measures the joint,
 * feeds the repetition counter, and produces two separate things:
 *
 *   - `LiveTrackingState`, for the screen in front of the patient, updated
 *     every frame;
 *   - `MotorResult`, once, when the exercise ends, for the database and the
 *     AI layer.
 *
 * They are deliberately different shapes. Per-frame values must never reach the
 * adaptation layer (docs/08, Rule 8), and keeping the two apart makes that a
 * property of the code rather than a promise.
 */

import type {
  Level,
  LiveTrackingState,
  MotorExercise,
  MotorResult,
  PoseFrame,
  PoseLandmarkName,
} from "@/lib/contracts";
import { getLevel } from "@/lib/exercises/catalog";
import { angleFromFrame } from "@/lib/cv/angles";
import { frameConfidence, frameIsValid, isInFrame, mirrorLandmark } from "@/lib/cv/landmarks";
import { ExponentialSmoother, mean } from "@/lib/cv/smoothing";
import { RepCounter } from "@/lib/cv/repCounter";

/**
 * How long tracking may be poor before the patient is told. Short drop-outs
 * happen constantly — a hand crossing the body, a moment of motion blur — and
 * warning about each one would make the screen unusable (docs/04).
 */
const WARN_AFTER_MS = 700;
/** How long before the repetition in progress is given up as unrecoverable. */
const ABANDON_AFTER_MS = 3000;
/** Confidence below which a rep is not trusted, matching the counter's floor. */
const RELIABLE_CONFIDENCE = 0.6;

export type TrackerOptions = {
  exercise: MotorExercise;
  level: Level;
  /** Which side this patient works on, so `mirror` exercises follow them. */
  affectedSide: "left" | "right" | "both";
};

export class ExerciseTracker {
  private readonly counter: RepCounter;
  private readonly smoother = new ExponentialSmoother();
  private readonly required: PoseLandmarkName[];
  private readonly targetReps: number;
  private readonly targetRomDeg: number;

  private badFrameSince: number | null = null;
  private invalidSegments = 0;
  private confidenceSamples: number[] = [];
  private lastGuidance: string | null = null;
  private startedAt: number | null = null;

  constructor(private readonly options: TrackerOptions) {
    const rung = getLevel(options.exercise, options.level) as {
      reps: number;
      targetRomDeg: number;
      holdSeconds: number;
    };
    this.targetReps = rung.reps;
    this.targetRomDeg = rung.targetRomDeg;

    this.counter = new RepCounter({
      restAngleDeg: options.exercise.restAngleDeg,
      direction: options.exercise.direction,
      targetRomDeg: rung.targetRomDeg,
      holdSeconds: rung.holdSeconds,
    });

    const joint = this.resolveJoint();
    this.required = [joint.from, joint.vertex, joint.to];
  }

  /**
   * Which landmarks to measure.
   *
   * Definitions are written for the left side. An exercise marked `mirror`
   * follows the patient's affected side, because that is the side being
   * rehabilitated; `both` and explicit sides are left as written.
   */
  private resolveJoint() {
    const { joint, side } = this.options.exercise;
    const shouldMirror =
      (side === "mirror" && this.options.affectedSide === "right") || side === "right";

    if (!shouldMirror) return joint;
    return {
      ...joint,
      from: mirrorLandmark(joint.from),
      vertex: mirrorLandmark(joint.vertex),
      to: mirrorLandmark(joint.to),
    };
  }

  /** Landmarks this exercise needs visible. Used by the setup check too. */
  get requiredLandmarks(): PoseLandmarkName[] {
    return this.required;
  }

  get targetRepCount(): number {
    return this.targetReps;
  }

  /**
   * Feed one frame. Returns what the patient's screen should show right now.
   */
  update(frame: PoseFrame, nowMs: number): LiveTrackingState {
    if (this.startedAt === null) this.startedAt = nowMs;

    const joint = this.resolveJoint();
    const confidence = frameConfidence(frame, this.required);
    const visible = frameIsValid(frame, this.required);
    // MediaPipe extrapolates points that have left the picture, so a landmark
    // outside the frame is a guess no matter how confident it claims to be.
    const inFrame = this.required.every((name) => {
      const landmark = frame[name];
      return landmark !== undefined && isInFrame(landmark);
    });
    const usable = visible && inFrame;

    if (!usable) {
      return this.handleBadFrame(nowMs, confidence, inFrame);
    }

    // Good frame. Clear any warning state and measure.
    this.badFrameSince = null;
    this.confidenceSamples.push(confidence);

    const raw = angleFromFrame(frame, joint.from, joint.vertex, joint.to);
    if (raw === null) return this.handleBadFrame(nowMs, confidence, inFrame);

    const angle = this.smoother.push(raw);
    this.counter.update(angle, confidence, nowMs);

    const phase = this.counter.currentPhase;
    const progress = this.counter.progressFor(angle);

    return {
      angleDeg: Math.round(angle),
      reps: this.counter.completedReps.length,
      phase,
      holdRemaining: this.counter.holdRemaining(nowMs),
      trackingValid: true,
      trackingConfidence: Math.round(confidence * 100) / 100,
      guidance: this.coachingLine(phase, progress),
    };
  }

  /**
   * What to say while the movement is going well. Kept short and specific;
   * silence is the default, because a line that changes every frame is noise.
   */
  private coachingLine(phase: string, progress: number): string | null {
    if (phase === "holding") return "Hold it there.";
    if (phase === "returning") return "Now come back down slowly.";
    if (phase === "rising" && progress > this.targetRomDeg * 0.8) return "Almost there.";
    if (phase === "waiting" && this.counter.completedReps.length === 0) {
      return "Start when you are ready.";
    }
    return null;
  }

  /**
   * A frame that cannot be measured. Short gaps are absorbed silently; longer
   * ones warn, then give up on the repetition in progress. What never happens
   * is a measurement being invented to fill the gap (Rule 7).
   */
  private handleBadFrame(nowMs: number, confidence: number, inFrame: boolean): LiveTrackingState {
    if (this.badFrameSince === null) this.badFrameSince = nowMs;
    const goneForMs = nowMs - this.badFrameSince;

    let guidance: string | null = null;

    if (goneForMs >= WARN_AFTER_MS) {
      this.counter.markTrackingLost();
      guidance = inFrame
        ? "Move a little so the camera can see your arm."
        : "Step back so your whole body is in the picture.";
    }

    if (goneForMs >= ABANDON_AFTER_MS) {
      // Count one dropout, not one per frame, so `invalid_segments` means
      // "times tracking was lost" rather than "frames that were bad".
      if (this.counter.currentPhase !== "waiting") this.invalidSegments += 1;
      this.counter.abandonCurrentRep();
      // Forget the smoothed history: after three seconds the body may be
      // somewhere else entirely, and averaging across the gap would drag the
      // first good frames back towards a position that no longer exists.
      this.smoother.reset();
      guidance = "Tracking is paused. Get back into the picture and it will pick up again.";
    }

    this.lastGuidance = guidance;

    return {
      angleDeg: this.smoother.current === null ? null : Math.round(this.smoother.current),
      reps: this.counter.completedReps.length,
      phase: this.counter.currentPhase,
      holdRemaining: 0,
      trackingValid: goneForMs < WARN_AFTER_MS,
      trackingConfidence: Math.round(confidence * 100) / 100,
      guidance: guidance ?? this.lastGuidance,
    };
  }

  /** Whether the patient has done everything this level asked for. */
  get isComplete(): boolean {
    return this.counter.validRepCount >= this.targetReps;
  }

  /**
   * Close the exercise and produce the result the rest of the system consumes.
   *
   * Range-of-motion statistics are computed only over repetitions the camera
   * saw reliably. Including a rep measured through a dropout would move the
   * average for a reason that has nothing to do with the patient.
   */
  finish(status: MotorResult["status"] = "completed"): MotorResult {
    const reps = this.counter.completedReps;
    const reliable = reps.filter((rep) => rep.tracking_confidence >= RELIABLE_CONFIDENCE);
    const measured = reliable.length > 0 ? reliable : reps;
    const roms = measured.map((rep) => rep.rom_deg);
    const validReps = this.counter.validRepCount;

    const overallConfidence = mean(this.confidenceSamples);

    // If nothing at all could be measured, say so rather than reporting a
    // clean set of zeroes that reads like a patient who did not move.
    const trackingFailed = reps.length === 0 && overallConfidence < RELIABLE_CONFIDENCE;

    return {
      modality: "motor",
      exercise_id: this.options.exercise.id,
      level: this.options.level,
      status: trackingFailed ? "tracking_failed" : status,
      valid_reps: validReps,
      target_reps: this.targetReps,
      rom_mean_deg: Math.round(mean(roms) * 10) / 10,
      rom_min_deg: roms.length > 0 ? Math.min(...roms) : 0,
      rom_max_deg: roms.length > 0 ? Math.max(...roms) : 0,
      avg_rep_duration_s:
        Math.round(mean(measured.map((rep) => rep.duration_s)) * 10) / 10,
      tracking_confidence: Math.round(overallConfidence * 100) / 100,
      invalid_segments: this.invalidSegments,
      reps,
    };
  }
}
