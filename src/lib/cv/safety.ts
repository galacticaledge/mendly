/**
 * The safety watcher.
 *
 * The brief for this is narrow and worth stating plainly: raise a practitioner
 * alert when something looks wrong, without crying wolf at the ordinary things
 * a person does in front of a camera. Sitting down heavily, bending to pick
 * something up, and walking out of shot are all normal, and a watcher that
 * alerts on any of them would be turned off within a day.
 *
 * So no single observation raises an urgent alert. A possible fall requires a
 * fast downward movement AND the body staying low afterwards AND staying still
 * while it is down. Sitting fails the second test, bending over fails the
 * third, and leaving the room is not a fall at all — it is a separate, quieter
 * signal, because someone walking away from their session is not an emergency
 * (docs/07, and the product note that disappearing from view alone should not
 * be alarming).
 *
 * What this is not: a fall detector with a clinical claim behind it. It is a
 * prototype support signal that puts a human in the loop quickly.
 */

import type { PoseFrame, SafetyAlert } from "@/lib/contracts";
import { isVisible } from "@/lib/cv/landmarks";

/** Fraction of frame height the head must drop through to look like a fall. */
const FALL_DROP = 0.22;
/** Window the drop must happen within, in ms. Slower is sitting down. */
const DESCENT_WINDOW_MS = 900;
/** Head must be at least this far down the frame to count as "on the floor". */
const LOW_HEAD_Y = 0.6;
/** Torso this far from vertical, in degrees, is lying rather than sitting. */
const HORIZONTAL_TILT_DEG = 45;
/** How long the low, still position must persist before alerting, in ms. */
const PERSIST_MS = 4000;
/** Movement range under this over the persistence window counts as still. */
const STILLNESS_RANGE = 0.05;
/** Low and horizontal for this long alerts even if the fall itself was missed. */
const PROLONGED_FLOOR_MS = 12_000;
/** Person absent this long during a session is worth a quiet mention. */
const ABSENCE_MS = 25_000;

type Sample = {
  t: number;
  /** Vertical position of the head, 0 at the top of the frame, 1 at the bottom. */
  headY: number;
  /** Angle of the torso away from vertical, in degrees. 0 upright, 90 lying. */
  tiltDeg: number;
};

/**
 * Where the head is and how the torso is oriented, or null if the frame does
 * not show enough of the body to say.
 */
function readPosture(frame: PoseFrame): { headY: number; tiltDeg: number } | null {
  const leftShoulder = frame.left_shoulder;
  const rightShoulder = frame.right_shoulder;
  const leftHip = frame.left_hip;
  const rightHip = frame.right_hip;

  if (!isVisible(leftShoulder) || !isVisible(rightShoulder)) return null;
  if (!isVisible(leftHip) || !isVisible(rightHip)) return null;

  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  // The head, or the shoulders as a stand-in when the face is turned away.
  const head = isVisible(frame.nose) ? frame.nose : null;
  const headY = head ? head.y : shoulderMid.y;

  // Angle of the hip-to-shoulder line away from straight up. A seated person
  // reads near 0°; someone lying on the floor reads near 90°.
  const dx = shoulderMid.x - hipMid.x;
  const dy = hipMid.y - shoulderMid.y;
  const tiltDeg = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;

  return { headY, tiltDeg };
}

export class SafetyWatcher {
  private samples: Sample[] = [];
  private lowSince: number | null = null;
  private lastSeenAt: number | null = null;
  /** Set once an alert has fired, so one event does not alert repeatedly. */
  private episodeAlerted = false;
  private absenceAlerted = false;

  /**
   * Feed a frame. Returns an alert to send, or null.
   *
   * Call this at a low rate — a few times a second is plenty. Posture changes
   * over hundreds of milliseconds, and sampling every frame only costs battery.
   */
  update(frame: PoseFrame, nowMs: number): SafetyAlert | null {
    const posture = readPosture(frame);

    if (!posture) {
      return this.handleAbsence(nowMs);
    }

    this.lastSeenAt = nowMs;
    this.absenceAlerted = false;

    this.samples.push({ t: nowMs, ...posture });
    // Keep a rolling window a little longer than the longest thing we look for.
    const cutoff = nowMs - (PROLONGED_FLOOR_MS + 2000);
    this.samples = this.samples.filter((sample) => sample.t >= cutoff);

    const isLow = posture.headY >= LOW_HEAD_Y && posture.tiltDeg >= HORIZONTAL_TILT_DEG;

    if (!isLow) {
      // Back upright: the episode is over and the watcher rearms.
      this.lowSince = null;
      this.episodeAlerted = false;
      return null;
    }

    if (this.lowSince === null) this.lowSince = nowMs;
    if (this.episodeAlerted) return null;

    const lowForMs = nowMs - this.lowSince;
    const descent = this.fastDescentBefore(this.lowSince);
    const still = this.isStillSince(this.lowSince);

    // A fall: went down fast, stayed down, and has not moved since.
    if (descent !== null && lowForMs >= PERSIST_MS && still) {
      this.episodeAlerted = true;
      return {
        kind: "possible_fall",
        severity: "urgent",
        message:
          "The camera saw a sudden drop, and the person has stayed low and still since. Please check on them.",
        evidence: {
          head_drop_fraction: Math.round(descent.drop * 100) / 100,
          drop_over_ms: descent.overMs,
          low_for_ms: Math.round(lowForMs),
          torso_tilt_deg: Math.round(posture.tiltDeg),
          head_y: Math.round(posture.headY * 100) / 100,
          still: true,
        },
      };
    }

    // No fast drop was seen — it may have happened off camera, or the descent
    // was slow — but the body has been low and horizontal for a long time.
    // Less certain, so it asks for attention rather than declaring an emergency.
    if (lowForMs >= PROLONGED_FLOOR_MS && still) {
      this.episodeAlerted = true;
      return {
        kind: "prolonged_floor_position",
        severity: "attention",
        message:
          "The person has been low to the ground and still for a while. No fall was seen, so this may be nothing.",
        evidence: {
          low_for_ms: Math.round(lowForMs),
          torso_tilt_deg: Math.round(posture.tiltDeg),
          head_y: Math.round(posture.headY * 100) / 100,
          fast_descent_seen: false,
        },
      };
    }

    return null;
  }

  /**
   * Was there a fast downward movement just before this moment?
   *
   * Looks back through the window for the highest the head was, and reports
   * how far it fell from there. Speed is what separates a fall from sitting
   * down: both end low, only one gets there in under a second.
   */
  private fastDescentBefore(atMs: number): { drop: number; overMs: number } | null {
    const window = this.samples.filter(
      (sample) => sample.t >= atMs - DESCENT_WINDOW_MS && sample.t <= atMs,
    );
    if (window.length < 2) return null;

    const highest = window.reduce((best, s) => (s.headY < best.headY ? s : best), window[0]);
    const lowest = window[window.length - 1];
    const drop = lowest.headY - highest.headY;

    if (drop < FALL_DROP) return null;
    return { drop, overMs: Math.round(lowest.t - highest.t) };
  }

  /**
   * Has the body been still since it went down?
   *
   * Someone who fell and is getting themselves back up is moving, and does not
   * need an emergency alert. Someone who is not moving at all does.
   */
  private isStillSince(sinceMs: number): boolean {
    const window = this.samples.filter((sample) => sample.t >= sinceMs);
    if (window.length < 3) return false;
    const ys = window.map((sample) => sample.headY);
    return Math.max(...ys) - Math.min(...ys) < STILLNESS_RANGE;
  }

  /**
   * Nobody in the picture.
   *
   * Deliberately mild. A person leaving the frame is usually a person leaving
   * the room, and treating every absence as an emergency would make the urgent
   * alerts worthless. It is still worth telling the practitioner that a session
   * stopped with nobody there.
   */
  private handleAbsence(nowMs: number): SafetyAlert | null {
    if (this.lastSeenAt === null) {
      this.lastSeenAt = nowMs;
      return null;
    }
    const goneForMs = nowMs - this.lastSeenAt;
    if (goneForMs < ABSENCE_MS || this.absenceAlerted) return null;

    this.absenceAlerted = true;
    return {
      kind: "tracking_lost",
      severity: "info",
      message: "The session is open but nobody has been in the picture for a while.",
      evidence: { away_for_ms: Math.round(goneForMs) },
    };
  }
}
