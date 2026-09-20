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
import { isInFrame, isVisible } from "@/lib/cv/landmarks";

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
/**
 * Gone this long, after dropping out of the bottom of the picture, is a fall.
 *
 * Long enough that ducking out of shot to pick something up is back before it
 * fires, and far short of ABSENCE_MS, because the thing being reported here is
 * not "nobody is there" — it is "they went down fast and have not got up".
 */
const VANISH_PERSIST_MS = 8000;
/** Head at least this far down the frame when last seen: going down, not away. */
const VANISHED_HEAD_Y = 0.45;

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
 *
 * "Enough of the body" includes being inside the picture. MediaPipe keeps
 * reporting a landmark that has left the frame, extrapolated from the rest of
 * the body (landmarks.ts, isInFrame), and a body that has dropped below the
 * bottom edge comes back as shoulders neatly above hips — upright — at a head
 * height of 1.2. Read as a measurement that is a person standing calmly off
 * the bottom of the screen, which is why a fall in front of a laptop webcam
 * raised nothing at all: never low and horizontal at the same time, and never
 * absent either, so neither the fall test nor the absence test could fire.
 * Out of the picture is not a posture. It is gone, and handleAbsence decides
 * what that means.
 */
function readPosture(frame: PoseFrame): { headY: number; tiltDeg: number } | null {
  const leftShoulder = frame.left_shoulder;
  const rightShoulder = frame.right_shoulder;
  const leftHip = frame.left_hip;
  const rightHip = frame.right_hip;

  if (!isVisible(leftShoulder) || !isVisible(rightShoulder)) return null;
  if (!isVisible(leftHip) || !isVisible(rightHip)) return null;
  // The shoulders anchor everything below, including the fallback head
  // position. Once they are outside the frame nothing here is a measurement.
  if (!isInFrame(leftShoulder) || !isInFrame(rightShoulder)) return null;

  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  // The head, or the shoulders as a stand-in when the face is turned away or
  // has gone over the edge of the picture.
  const nose = frame.nose;
  const head = isVisible(nose) && isInFrame(nose) ? nose : null;
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
  private vanishAlerted = false;

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
    this.vanishAlerted = false;

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
   * Two different things look like this, and the difference is everything.
   *
   * Someone who walks away from their session is not an emergency, and that is
   * the mild signal at the bottom of this method. But a camera on a desk cannot
   * see the floor: when a person actually falls in front of a laptop they leave
   * the bottom of the frame on the way down, and the fall test above — low head,
   * horizontal torso, still for four seconds — needs a view of them on the
   * ground that this camera will never have. Every real fall in front of a
   * laptop ended up in here, and was reported as "nobody has been in the
   * picture for a while", at the mildest severity the watcher has, 25 seconds
   * late.
   *
   * So the same corroboration the in-frame fall requires is applied to the
   * disappearance instead, three independent observations rather than one: they
   * went down fast, they were already low in the picture when last seen, and
   * they have not come back. Walking out of shot fails the first two — nobody
   * leaves a room by accelerating downwards — so it is still only a mention.
   */
  private handleAbsence(nowMs: number): SafetyAlert | null {
    if (this.lastSeenAt === null) {
      this.lastSeenAt = nowMs;
      return null;
    }
    const goneForMs = nowMs - this.lastSeenAt;

    if (!this.vanishAlerted && goneForMs >= VANISH_PERSIST_MS) {
      const descent = this.fastDescentBefore(this.lastSeenAt);
      const last = this.samples[this.samples.length - 1];

      if (descent !== null && last !== undefined && last.headY >= VANISHED_HEAD_Y) {
        this.vanishAlerted = true;
        // Also stops the quiet absence note firing 17 seconds later about the
        // same disappearance.
        this.absenceAlerted = true;
        return {
          kind: "fall_out_of_view",
          severity: "urgent",
          message:
            "The camera saw a sudden drop, and then lost sight of them below the picture. " +
            "They have not come back. Please check on them.",
          evidence: {
            head_drop_fraction: Math.round(descent.drop * 100) / 100,
            drop_over_ms: descent.overMs,
            head_y_when_last_seen: Math.round(last.headY * 100) / 100,
            torso_tilt_deg_when_last_seen: Math.round(last.tiltDeg),
            out_of_view_for_ms: Math.round(goneForMs),
          },
        };
      }
    }

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
