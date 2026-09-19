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
  JointSpec,
  Level,
  LiveTrackingState,
  MotorExercise,
  MotorResult,
  PoseFrame,
  PoseLandmarkName,
} from "@/lib/contracts";
import { getLevel } from "@/lib/exercises/catalog";
import { angleFromFrame, rayLengths } from "@/lib/cv/angles";
import {
  frameConfidence,
  frameIsValid,
  isInFrame,
  mirrorLandmark,
} from "@/lib/cv/landmarks";
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
/**
 * Shortest a limb may appear in the image, as a fraction of the frame, before
 * its angle stops meaning anything.
 *
 * An upper arm across the image spans roughly 0.15 of the frame. When it
 * points towards the camera that collapses towards zero, and a couple of
 * pixels of landmark jitter then swings the measured angle wildly. Below this
 * the frame is treated as untracked rather than measured, which is the honest
 * reading: the camera cannot see the movement from where it is standing.
 */
const MIN_PROJECTED_LIMB = 0.05;

/**
 * Which landmarks an exercise measures for a given patient.
 *
 * Definitions are written for the left side. An exercise marked `mirror`
 * follows the patient's affected side, because that is the side being
 * rehabilitated; `both` and explicit sides are left as written.
 *
 * Exported because the setup check needs the same answer before a tracker
 * exists: it has to confirm the camera can see what is about to be measured.
 */
export function resolveJoint(
  exercise: MotorExercise,
  affectedSide: "left" | "right" | "both",
): JointSpec {
  const { joint, side } = exercise;
  const shouldMirror =
    (side === "mirror" && affectedSide === "right") || side === "right";

  if (!shouldMirror) return joint;
  return {
    ...joint,
    from: mirrorLandmark(joint.from),
    vertex: mirrorLandmark(joint.vertex),
    to: mirrorLandmark(joint.to),
  };
}

/** The three landmarks an exercise measures, in order. */
export function requiredLandmarksFor(
  exercise: MotorExercise,
  affectedSide: "left" | "right" | "both",
): PoseLandmarkName[] {
  const joint = resolveJoint(exercise, affectedSide);
  return [joint.from, joint.vertex, joint.to];
}

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

  private readonly minProjectedLimb: number;
  private badFrameSince: number | null = null;
  private invalidSegments = 0;
  private confidenceSamples: number[] = [];
  private lastGuidance: string | null = null;
  private startedAt: number | null = null;
  /** Outcome of the most recent movement, for the line shown on screen. */
  private lastRepCounted: boolean | null = null;

  constructor(private readonly options: TrackerOptions) {
    const rung = getLevel(options.exercise, options.level) as {
      reps: number;
      targetRomDeg: number;
      holdSeconds: number;
      toleranceDeg?: number;
    };
    this.targetReps = rung.reps;
    this.targetRomDeg = rung.targetRomDeg;
    this.minProjectedLimb = options.exercise.minProjectedLimb ?? MIN_PROJECTED_LIMB;

    this.counter = new RepCounter({
      restAngleDeg: options.exercise.restAngleDeg,
      direction: options.exercise.direction,
      targetRomDeg: rung.targetRomDeg,
      holdSeconds: rung.holdSeconds,
      toleranceDeg: rung.toleranceDeg,
      targetReps: rung.reps,
    });

    const joint = this.resolveJoint();
    this.required = [joint.from, joint.vertex, joint.to];
  }

  private resolveJoint() {
    return resolveJoint(this.options.exercise, this.options.affectedSide);
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
  update(frame: PoseFrame, nowMs: number, aspectRatio = 1): LiveTrackingState {
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

    // A limb pointing at the lens projects onto almost nothing, and its angle
    // is then noise. Refusing to measure it is what stops a movement aimed at
    // the camera producing confident nonsense.
    //
    // This is checked before the dropout timer is cleared below. Clearing it
    // first would restart the timer on every foreshortened frame, so tracking
    // would keep reporting itself valid however long the arm stayed end on.
    const rays = rayLengths(
      frame,
      joint.from,
      joint.vertex,
      joint.to,
      aspectRatio,
    );
    if (
      rays !== null &&
      Math.min(rays.first, rays.second) < this.minProjectedLimb
    ) {
      return this.handleBadFrame(nowMs, confidence, inFrame, "foreshortened");
    }

    const raw = angleFromFrame(
      frame,
      joint.from,
      joint.vertex,
      joint.to,
      aspectRatio,
    );
    if (raw === null) return this.handleBadFrame(nowMs, confidence, inFrame);

    // Good frame. Clear any warning state and measure.
    this.badFrameSince = null;
    this.confidenceSamples.push(confidence);

    const angle = this.smoother.push(raw);
    const completed = this.counter.update(angle, confidence, nowMs);
    if (completed) this.lastRepCounted = completed.valid;

    const phase = this.counter.currentPhase;
    const progress = this.counter.progressFor(angle);

    return {
      angleDeg: Math.round(angle),
      reps: this.counter.completedReps.length,
      validReps: this.counter.validRepCount,
      targetReps: this.targetReps,
      lastRepCounted: this.lastRepCounted,
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
    if (phase === "rising" && progress > this.targetRomDeg * 0.8)
      return "Almost there.";

    if (phase === "waiting") {
      // Nothing can be counted until the joint has been seen at rest, so say
      // so plainly rather than letting the person work and see no number move.
      if (!this.counter.isArmed) return "Start from a resting position.";
      if (this.lastRepCounted === false) {
        return "That one did not quite reach far enough. Try to go a little further.";
      }
      if (this.counter.completedReps.length === 0)
        return "Start when you are ready.";
    }
    return null;
  }

  /**
   * A frame that cannot be measured. Short gaps are absorbed silently; longer
   * ones warn, then give up on the repetition in progress. What never happens
   * is a measurement being invented to fill the gap (Rule 7).
   */
  private handleBadFrame(
    nowMs: number,
    confidence: number,
    inFrame: boolean,
    reason: "hidden" | "foreshortened" = "hidden",
  ): LiveTrackingState {
    if (this.badFrameSince === null) this.badFrameSince = nowMs;
    const goneForMs = nowMs - this.badFrameSince;

    let guidance: string | null = null;

    if (goneForMs >= WARN_AFTER_MS) {
      this.counter.markTrackingLost();
      guidance =
        reason === "foreshortened"
          ? "Turn a little to the side, so the camera can see your arm from across rather than end on."
          : inFrame
            ? "Move a little so the camera can see your arm."
            : "Step back so your whole body is in the picture.";
    }

    if (goneForMs >= ABANDON_AFTER_MS) {
      // Count one dropout, not one per frame, so `invalid_segments` means
      // "times tracking was lost" rather than "frames that were bad".
      if (this.counter.currentPhase !== "waiting") this.invalidSegments += 1;
      this.counter.abandonCurrentRep();
      // The body may be somewhere else now, so the joint has to be seen at
      // rest again before another repetition can start.
      this.counter.requireRecalibration();
      // Forget the smoothed history: after three seconds the body may be
      // somewhere else entirely, and averaging across the gap would drag the
      // first good frames back towards a position that no longer exists.
      this.smoother.reset();
      guidance =
        "Tracking is paused. Get back into the picture and it will pick up again.";
    }

    this.lastGuidance = guidance;

    return {
      angleDeg:
        this.smoother.current === null
          ? null
          : Math.round(this.smoother.current),
      reps: this.counter.completedReps.length,
      validReps: this.counter.validRepCount,
      targetReps: this.targetReps,
      lastRepCounted: this.lastRepCounted,
      phase: this.counter.currentPhase,
      holdRemaining: 0,
      trackingValid: goneForMs < WARN_AFTER_MS,
      trackingConfidence: Math.round(confidence * 100) / 100,
      guidance: guidance ?? this.lastGuidance,
    };
  }

  /**
   * Whether this exercise is over.
   *
   * Either the level was completed, or the attempt allowance is spent. The
   * second case matters: if the movement is never quite reaching the target —
   * a tired patient, an awkward camera angle, a level set too high — the
   * exercise has to end and say so, rather than counting upwards forever
   * while the person keeps going.
   */
  get isComplete(): boolean {
    return this.counter.isFull;
  }

  /** Movements that met the range, the hold and the confidence floor. */
  get validRepCount(): number {
    return this.counter.validRepCount;
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
    const reliable = reps.filter(
      (rep) => rep.tracking_confidence >= RELIABLE_CONFIDENCE,
    );
    const measured = reliable;
    const roms = measured.map((rep) => rep.rom_deg);
    const validReps = this.counter.validRepCount;

    const overallConfidence = mean(this.confidenceSamples);

    // If nothing at all could be measured, say so rather than reporting a
    // clean set of zeroes that reads like a patient who did not move.
    const trackingFailed =
      reps.length === 0 && overallConfidence < RELIABLE_CONFIDENCE;

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
