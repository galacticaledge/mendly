/**
 * Shared contracts for Mendly.
 *
 * Every layer agrees on these shapes: the CV pipeline produces them, the AI
 * adaptation layer consumes them, the database stores them, and both UIs read
 * them. Changing a shape here is a cross-team change (see docs/08).
 *
 * Measurement fields use snake_case because they are wire format — they travel
 * through the API and are stored verbatim as JSONB. Everything else is
 * ordinary TypeScript camelCase.
 */

/* ------------------------------------------------------------------ */
/* Pose vocabulary                                                     */
/* ------------------------------------------------------------------ */

/**
 * The subset of MediaPipe Pose landmarks this product measures, named rather
 * than numbered. Exercise definitions refer to landmarks by these names so a
 * reader can tell what is being measured without looking up an index; the
 * name-to-index mapping lives in `src/lib/cv/landmarks.ts`.
 */
export const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
] as const;

export type PoseLandmarkName = (typeof POSE_LANDMARK_NAMES)[number];

/** One landmark as the CV layer sees it, after MediaPipe and before metrics. */
export type Landmark = {
  x: number;
  y: number;
  z: number;
  /** MediaPipe's own estimate that the point is visible, 0–1. */
  visibility: number;
};

/** A whole body's landmarks for one frame, keyed by name. */
export type PoseFrame = Partial<Record<PoseLandmarkName, Landmark>>;

/* ------------------------------------------------------------------ */
/* Exercises                                                           */
/* ------------------------------------------------------------------ */

/** Cognitive exercises run at the screen. Motor exercises need the camera. */
export type Modality = "cognitive" | "motor";

/** What the patient's body is doing. Standing needs practitioner permission. */
export type Posture = "seated" | "standing";

/**
 * How much of the body the camera must see.
 * `upper` is shoulders-up, which is all a cognitive exercise needs.
 * `full` requires the whole body in frame and is checked before it is used.
 */
export type BodyView = "upper" | "full";

/** Difficulty rung. Practitioner rules cap this per exercise. */
export type Level = 1 | 2 | 3 | 4 | 5;

/**
 * Tags describing what an exercise demands of the body. Practitioners exclude
 * by tag rather than by exercise, so one contraindication covers the whole
 * catalog including exercises added later.
 */
export type ExerciseTag =
  | "overhead_reach"
  | "weight_bearing"
  | "balance"
  | "fine_motor"
  | "bilateral"
  | "sustained_attention"
  | "language"
  | "working_memory"
  | "processing_speed";

/** The joint measured by a motor exercise, as three pose landmark names. */
export type JointSpec = {
  /** Human name of the joint at the vertex, e.g. "elbow". */
  name: string;
  /** Landmark forming the first ray from the vertex. */
  from: PoseLandmarkName;
  /** The vertex: the joint itself. */
  vertex: PoseLandmarkName;
  /** Landmark forming the second ray from the vertex. */
  to: PoseLandmarkName;
};

/** One rung of a motor exercise: how many, how far, how long to hold. */
export type MotorLevel = {
  level: Level;
  reps: number;
  /** Angle sweep a repetition must cover to count, in degrees. */
  targetRomDeg: number;
  /** Seconds the end position must be held. 0 means no hold. */
  holdSeconds: number;
  /**
   * Degrees either side of the target that still count, for exercises where
   * going too far is as wrong as not going far enough.
   *
   * Most exercises want as much range as the person can manage, so more is
   * never an error and this is left unset: anything at or past the target
   * counts. A proprioception task is the opposite — the point is to land ON a
   * remembered angle — so overshooting by 20 degrees is a miss, and setting
   * this turns the target into a band.
   */
  toleranceDeg?: number;
};

export type MotorExercise = {
  id: string;
  modality: "motor";
  /** Name in the person's words, not clinical terms. */
  name: string;
  /** One instructional sentence read aloud at the start. */
  instruction: string;
  posture: Posture;
  view: BodyView;
  /**
   * Where the camera has to be for the movement to be measurable.
   *
   * `front` is the default and what a laptop webcam gives you. `side` is for
   * movements that happen in the sagittal plane — raising an arm forwards,
   * pulling the foot up — where a front-on view sees the limb end on: it
   * projects onto almost nothing in the image and its angle becomes noise.
   * The setup check tells the patient to turn before these start.
   */
  cameraAngle: "front" | "side";
  /**
   * Hide the live angle and rep feedback from the patient.
   *
   * Only for exercises where seeing the measurement would defeat the point —
   * a proprioception task asks someone to find a remembered position without
   * looking, and a number on screen would turn it into a tracking exercise.
   */
  hideLiveFeedback?: boolean;
  /**
   * Shortest the measured limb may appear in the image, as a fraction of the
   * frame, before its angle is treated as unreliable.
   *
   * The default suits an arm. A foot is genuinely short in frame even when the
   * camera can see it perfectly well, so an exercise measuring a small segment
   * has to lower this or every good frame is thrown away as foreshortened.
   */
  minProjectedLimb?: number;
  tags: ExerciseTag[];
  joint: JointSpec;
  /**
   * Whether the measured angle grows or shrinks during the active phase.
   * A shoulder raise opens the shoulder angle; an elbow bend closes it.
   */
  direction: "increasing" | "decreasing";
  /** Angle at rest, used to detect the start of a repetition. */
  restAngleDeg: number;
  /** Which arm/leg. `mirror` means it follows the patient's affected side. */
  side: "left" | "right" | "mirror" | "both";
  levels: MotorLevel[];
};

/** One rung of a cognitive exercise: how many rounds, how fast, how hard. */
export type CognitiveLevel = {
  level: Level;
  /** Number of rounds or trials in the exercise. */
  rounds: number;
  /** Game-specific difficulty knob: grid size, list length, symbol count. */
  size: number;
  /** Seconds allowed per round. 0 means untimed. */
  secondsPerRound: number;
};

export type CognitiveExercise = {
  id: string;
  modality: "cognitive";
  name: string;
  instruction: string;
  /** Which game implementation renders this exercise. */
  game: "card-match" | "symbol-sort" | "word-recall" | "math-drill";
  /** The cognitive function this game exercises, in plain words. */
  focus: string;
  tags: ExerciseTag[];
  levels: CognitiveLevel[];
};

export type Exercise = MotorExercise | CognitiveExercise;

export function isMotor(exercise: Exercise): exercise is MotorExercise {
  return exercise.modality === "motor";
}

export function isCognitive(exercise: Exercise): exercise is CognitiveExercise {
  return exercise.modality === "cognitive";
}

/* ------------------------------------------------------------------ */
/* Practitioner rules — the boundaries the AI works inside             */
/* ------------------------------------------------------------------ */

/**
 * The practitioner's standing instructions for one patient. This is the
 * machine-readable form of the `rule.md` in docs/practitioner_guardrails_flow.
 *
 * The AI may propose only what these rules already permit. Nothing else in the
 * system grants permission.
 */
export type PractitionerRules = {
  /** The approved exercise pool. An id absent from this list cannot be used. */
  allowedExerciseIds: string[];
  /** Per-exercise difficulty ceiling. Missing id means level 1 only. */
  maxLevel: Record<string, Level>;
  /** Standing exercises are refused outright unless this is true. */
  standingAllowed: boolean;
  /** Body demands this patient must not be asked for. */
  contraindications: ExerciseTag[];
  /** Largest number of exercises in one proposed set. */
  maxExercisesPerSet: number;
  /** Ceiling on estimated minutes of motor work in one set. */
  maxMotorMinutes: number;
  /** Which side the stroke affected, so `mirror` exercises pick an arm. */
  affectedSide: "left" | "right" | "both";
  /** Rehabilitation goals, in the practitioner's words. Steers the AI. */
  goals: string[];
  /** Free-text guidance shown to the AI and to the practitioner. */
  notes: string;
};

/* ------------------------------------------------------------------ */
/* AI proposals                                                        */
/* ------------------------------------------------------------------ */

/** One exercise the AI wants the patient to do next, at a chosen level. */
export type ProposedExercise = {
  exerciseId: string;
  level: Level;
  /** Why this exercise at this level, in one sentence, for the practitioner. */
  rationale: string;
};

/**
 * A set of exercises the AI proposes. It is never given to a patient in this
 * state: it must be approved by a practitioner first.
 */
export type ExerciseSetProposal = {
  exercises: ProposedExercise[];
  /** One paragraph explaining the set as a whole. */
  summary: string;
  /**
   * Which engine produced it, recorded so a draft can be explained honestly.
   *
   * `backboard` is the normal path: the LLM service from the architecture
   * plan, routed to Gemini. `rules-engine` is the local deterministic planner,
   * which runs when no key is configured or when the model call fails, so a
   * patient always has a session to do.
   */
  source: "backboard" | "rules-engine";
};

/** A single way a proposal broke the practitioner's rules. */
export type GuardrailViolation = {
  exerciseId: string;
  /** Machine-readable reason, so the UI can group violations. */
  code:
    | "not_in_pool"
    | "unknown_exercise"
    | "level_above_cap"
    | "standing_not_allowed"
    | "contraindicated"
    | "set_too_long"
    | "over_motor_minutes"
    | "duplicate";
  /** The same reason written for a human reviewer. */
  message: string;
};

/**
 * The result of checking a proposal against the rules. The AI agent flow in
 * the architecture plan calls this the validation step, and nothing reaches a
 * practitioner without passing through it.
 */
export type GuardrailResult = {
  /** The proposal with every violating exercise removed or clamped. */
  proposal: ExerciseSetProposal;
  /** What was removed or changed, and why. Always shown to the practitioner. */
  violations: GuardrailViolation[];
};

/** Where an exercise set is in the practitioner review loop. */
export type ExerciseSetStatus = "proposed" | "approved" | "rejected" | "completed";

/* ------------------------------------------------------------------ */
/* Measurement results                                                 */
/* ------------------------------------------------------------------ */

/** One repetition as observed by the CV layer. */
export type RepMeasurement = {
  rep: number;
  rom_deg: number;
  duration_s: number;
  valid: boolean;
  tracking_confidence: number;
};

/**
 * What the CV layer hands back when a motor exercise finishes.
 * These are observations, not clinical findings (Rule 5).
 */
export type MotorResult = {
  modality: "motor";
  exercise_id: string;
  level: Level;
  status: "completed" | "stopped_early" | "tracking_failed";
  valid_reps: number;
  target_reps: number;
  rom_mean_deg: number;
  rom_min_deg: number;
  rom_max_deg: number;
  avg_rep_duration_s: number;
  /** Mean landmark confidence across the frames that were counted, 0–1. */
  tracking_confidence: number;
  /** How many times tracking dropped long enough to pause counting. */
  invalid_segments: number;
  reps: RepMeasurement[];
};

/** What a cognitive game hands back when it finishes. */
export type CognitiveResult = {
  modality: "cognitive";
  exercise_id: string;
  level: Level;
  status: "completed" | "stopped_early";
  /** Correct responses over attempts, 0–1. */
  accuracy: number;
  avg_reaction_ms: number;
  errors: number;
  attempts: number;
  hints_used: number;
};

export type ExerciseResult = MotorResult | CognitiveResult;

/* ------------------------------------------------------------------ */
/* Live state — for the patient UI only, never for the AI              */
/* ------------------------------------------------------------------ */

/**
 * Per-frame state driving the on-screen coach. It is deliberately separate
 * from `MotorResult`: the AI layer must not be wired to per-frame values
 * (Rule 8 / docs/08).
 */
export type LiveTrackingState = {
  /** Current joint angle in degrees, after smoothing. Null while unknown. */
  angleDeg: number | null;
  /**
   * Movements counted so far, valid or not. This is the number of attempts,
   * and it is NOT what the patient's progress is measured against.
   */
  reps: number;
  /**
   * Movements that met the range and the hold, and were seen well enough.
   * This is what the target is counted against and what the screen shows.
   */
  validReps: number;
  /** The target for this level, so the UI never has to look it up itself. */
  targetReps: number;
  /**
   * Set for a moment after a movement that did not count, so the screen can
   * say why rather than leaving the number mysteriously unchanged.
   */
  lastRepCounted: boolean | null;
  /** Where the current repetition is in its cycle. */
  phase: "waiting" | "rising" | "holding" | "returning";
  /** Seconds remaining on a hold, when one is required. */
  holdRemaining: number;
  trackingValid: boolean;
  trackingConfidence: number;
  /** What to tell the person right now, or null if nothing needs saying. */
  guidance: string | null;
};

/* ------------------------------------------------------------------ */
/* Environment and safety                                              */
/* ------------------------------------------------------------------ */

/**
 * Whether the current camera setup supports a given exercise. This is a
 * feasibility signal about the setup, not a guarantee of safety (docs/06).
 */
export type EnvironmentAssessment = {
  view: BodyView;
  /** Whether the required landmarks were visible for long enough. */
  feasible: boolean;
  /** Fraction of the sampled window where the requirement held, 0–1. */
  confidence: number;
  /** What the person should change, in one sentence, or null if nothing. */
  advice: string | null;
};

/** Kinds of thing the safety watcher can raise. Never a diagnosis (docs/07). */
export type AlertKind =
  | "possible_fall"
  | "prolonged_floor_position"
  | "tracking_lost"
  | "session_abandoned"
  | "patient_reported_pain";

export type AlertSeverity = "info" | "attention" | "urgent";

/** A safety signal on its way to the practitioner dashboard. */
export type SafetyAlert = {
  kind: AlertKind;
  severity: AlertSeverity;
  /** One sentence for the practitioner, written without clinical claims. */
  message: string;
  /** The observations behind the signal, so a human can judge it. */
  evidence: Record<string, number | string | boolean>;
};

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export type SessionStatus = "in_progress" | "completed" | "abandoned";

/** A post-session question, the "Answer Questions" step in the patient flow. */
export type SessionQuestion = {
  id: string;
  /** Asked in the second person and read aloud. */
  prompt: string;
  /** Fixed choices keep answers comparable across sessions. */
  choices: string[];
  /** Choosing one of these raises an alert for the practitioner. */
  flagChoices?: string[];
};

export type SessionAnswer = {
  questionId: string;
  answer: string;
};
