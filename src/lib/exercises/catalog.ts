/**
 * The exercise catalog.
 *
 * This is the whole universe of things Mendly can ask a patient to do. The AI
 * cannot invent an exercise: it can only choose ids from here, and only those
 * the practitioner has also placed in the patient's approved pool.
 *
 * Motor exercises name the three landmarks whose angle is measured, so the
 * measurement is legible from the definition alone. Angles are in degrees and
 * follow the convention in `src/lib/cv/angles.ts`: the angle at the vertex
 * landmark, between the rays to `from` and `to`, always 0–180.
 */

import type {
  CognitiveExercise,
  Exercise,
  ExerciseTag,
  Level,
  MotorExercise,
} from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";

/* ------------------------------------------------------------------ */
/* Motor exercises                                                     */
/* ------------------------------------------------------------------ */

const MOTOR: MotorExercise[] = [
  {
    id: "arm_raise",
    modality: "motor",
    name: "Arm raise",
    instruction: "Raise your arm out to the side, then lower it slowly.",
    posture: "seated",
    view: "upper",
    tags: [],
    // Shoulder abduction: the angle at the shoulder opens as the arm lifts
    // away from the body, measured from the hip through the shoulder to the
    // elbow.
    joint: { name: "shoulder", from: "left_hip", vertex: "left_shoulder", to: "left_elbow" },
    direction: "increasing",
    restAngleDeg: 15,
    side: "mirror",
    levels: [
      { level: 1, reps: 5, targetRomDeg: 30, holdSeconds: 0 },
      { level: 2, reps: 8, targetRomDeg: 45, holdSeconds: 0 },
      { level: 3, reps: 10, targetRomDeg: 60, holdSeconds: 1 },
      { level: 4, reps: 12, targetRomDeg: 70, holdSeconds: 2 },
      { level: 5, reps: 15, targetRomDeg: 80, holdSeconds: 3 },
    ],
  },
  {
    id: "overhead_arm_raise",
    modality: "motor",
    name: "Arm raise overhead",
    instruction: "Raise your arm up above your head, then lower it slowly.",
    posture: "seated",
    view: "upper",
    // Tagged so a practitioner can rule out overhead work with one setting,
    // for shoulder subluxation or pain, without editing the pool by hand.
    tags: ["overhead_reach"],
    joint: { name: "shoulder", from: "left_hip", vertex: "left_shoulder", to: "left_elbow" },
    direction: "increasing",
    restAngleDeg: 15,
    side: "mirror",
    levels: [
      { level: 1, reps: 5, targetRomDeg: 60, holdSeconds: 0 },
      { level: 2, reps: 8, targetRomDeg: 80, holdSeconds: 0 },
      { level: 3, reps: 10, targetRomDeg: 100, holdSeconds: 1 },
      { level: 4, reps: 12, targetRomDeg: 120, holdSeconds: 2 },
      { level: 5, reps: 15, targetRomDeg: 140, holdSeconds: 3 },
    ],
  },
  {
    id: "elbow_bend",
    modality: "motor",
    name: "Elbow bend",
    instruction: "Bend your elbow to bring your hand towards your shoulder, then straighten it.",
    posture: "seated",
    view: "upper",
    tags: [],
    // Elbow flexion: shoulder → elbow → wrist. The angle closes as the hand
    // comes up, so the active direction is decreasing.
    joint: { name: "elbow", from: "left_shoulder", vertex: "left_elbow", to: "left_wrist" },
    direction: "decreasing",
    restAngleDeg: 170,
    side: "mirror",
    levels: [
      { level: 1, reps: 5, targetRomDeg: 40, holdSeconds: 0 },
      { level: 2, reps: 8, targetRomDeg: 60, holdSeconds: 0 },
      { level: 3, reps: 10, targetRomDeg: 80, holdSeconds: 1 },
      { level: 4, reps: 12, targetRomDeg: 95, holdSeconds: 2 },
      { level: 5, reps: 15, targetRomDeg: 110, holdSeconds: 2 },
    ],
  },
  {
    id: "forward_reach",
    modality: "motor",
    name: "Reach and hold",
    instruction: "Reach your arm forward and out to about shoulder height, and hold it there.",
    posture: "seated",
    view: "upper",
    tags: [],
    // Measured at the shoulder, not the elbow, and reached out on a diagonal
    // rather than straight ahead. Both choices are forced by the camera.
    //
    // A reach aimed straight at the lens is the one movement a single webcam
    // cannot measure: the upper arm points almost directly at the camera, so
    // it projects onto almost nothing in the image and the angle between it
    // and anything else becomes noise. Reaching out on a diagonal keeps the
    // arm across the image where it can be seen, and the shoulder angle opens
    // steadily as the arm comes up — which is the part of the movement worth
    // measuring anyway.
    //
    // This is a different exercise from the arm raise: out to the side and
    // held, rather than lifted and lowered. The hold is the point of it.
    joint: { name: "shoulder", from: "left_hip", vertex: "left_shoulder", to: "left_elbow" },
    direction: "increasing",
    // The arm resting down by the side, which is where a seated person's arm
    // actually is between repetitions.
    restAngleDeg: 15,
    side: "mirror",
    levels: [
      { level: 1, reps: 3, targetRomDeg: 40, holdSeconds: 2 },
      { level: 2, reps: 5, targetRomDeg: 50, holdSeconds: 3 },
      { level: 3, reps: 6, targetRomDeg: 60, holdSeconds: 4 },
      { level: 4, reps: 8, targetRomDeg: 65, holdSeconds: 5 },
      { level: 5, reps: 10, targetRomDeg: 70, holdSeconds: 6 },
    ],
  },
  {
    id: "seated_march",
    modality: "motor",
    name: "Seated marching",
    instruction: "Lift one knee up, then put it down. Keep sitting tall.",
    posture: "seated",
    view: "full",
    tags: ["bilateral"],
    // Hip flexion: shoulder → hip → knee. Lifting the knee closes the angle.
    joint: { name: "hip", from: "left_shoulder", vertex: "left_hip", to: "left_knee" },
    direction: "decreasing",
    restAngleDeg: 95,
    side: "both",
    levels: [
      { level: 1, reps: 6, targetRomDeg: 20, holdSeconds: 0 },
      { level: 2, reps: 10, targetRomDeg: 25, holdSeconds: 0 },
      { level: 3, reps: 14, targetRomDeg: 30, holdSeconds: 1 },
      { level: 4, reps: 18, targetRomDeg: 35, holdSeconds: 1 },
      { level: 5, reps: 24, targetRomDeg: 40, holdSeconds: 1 },
    ],
  },
  {
    id: "sit_to_stand",
    modality: "motor",
    name: "Stand up and sit down",
    instruction: "Stand up from your chair, then sit back down slowly.",
    posture: "standing",
    view: "full",
    tags: ["weight_bearing", "balance"],
    // The hip angle opens as the body rises out of the chair.
    joint: { name: "hip", from: "left_shoulder", vertex: "left_hip", to: "left_knee" },
    direction: "increasing",
    restAngleDeg: 95,
    side: "both",
    levels: [
      { level: 1, reps: 3, targetRomDeg: 50, holdSeconds: 0 },
      { level: 2, reps: 5, targetRomDeg: 60, holdSeconds: 0 },
      { level: 3, reps: 8, targetRomDeg: 65, holdSeconds: 1 },
      { level: 4, reps: 10, targetRomDeg: 70, holdSeconds: 2 },
      { level: 5, reps: 12, targetRomDeg: 75, holdSeconds: 2 },
    ],
  },
  {
    id: "standing_side_reach",
    modality: "motor",
    name: "Standing side reach",
    instruction: "Stand tall and reach your arm out to the side, then bring it back.",
    posture: "standing",
    view: "full",
    tags: ["balance"],
    joint: { name: "shoulder", from: "left_hip", vertex: "left_shoulder", to: "left_elbow" },
    direction: "increasing",
    restAngleDeg: 15,
    side: "mirror",
    levels: [
      { level: 1, reps: 4, targetRomDeg: 40, holdSeconds: 0 },
      { level: 2, reps: 6, targetRomDeg: 55, holdSeconds: 1 },
      { level: 3, reps: 8, targetRomDeg: 65, holdSeconds: 2 },
      { level: 4, reps: 10, targetRomDeg: 75, holdSeconds: 2 },
      { level: 5, reps: 12, targetRomDeg: 85, holdSeconds: 3 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Cognitive exercises                                                 */
/* ------------------------------------------------------------------ */

const COGNITIVE: CognitiveExercise[] = [
  {
    id: "card_match",
    modality: "cognitive",
    name: "Card pairs",
    instruction: "Turn over two cards at a time and find the matching pairs.",
    game: "card-match",
    focus: "Holding things in mind",
    tags: ["working_memory", "sustained_attention"],
    levels: [
      { level: 1, rounds: 1, size: 4, secondsPerRound: 0 },
      { level: 2, rounds: 1, size: 6, secondsPerRound: 0 },
      { level: 3, rounds: 2, size: 6, secondsPerRound: 90 },
      { level: 4, rounds: 2, size: 8, secondsPerRound: 90 },
      { level: 5, rounds: 3, size: 10, secondsPerRound: 75 },
    ],
  },
  {
    id: "symbol_sort",
    modality: "cognitive",
    name: "Odd one out",
    instruction: "One shape in each row is different. Choose it as quickly as you can.",
    game: "symbol-sort",
    focus: "Attention and speed",
    tags: ["processing_speed", "sustained_attention"],
    levels: [
      { level: 1, rounds: 6, size: 3, secondsPerRound: 0 },
      { level: 2, rounds: 8, size: 4, secondsPerRound: 0 },
      { level: 3, rounds: 10, size: 5, secondsPerRound: 8 },
      { level: 4, rounds: 12, size: 6, secondsPerRound: 6 },
      { level: 5, rounds: 14, size: 7, secondsPerRound: 5 },
    ],
  },
  {
    id: "word_recall",
    modality: "cognitive",
    name: "Word list",
    instruction: "Read the words, then choose the ones you saw.",
    game: "word-recall",
    focus: "Words and memory",
    tags: ["language", "working_memory"],
    levels: [
      { level: 1, rounds: 2, size: 3, secondsPerRound: 0 },
      { level: 2, rounds: 2, size: 4, secondsPerRound: 0 },
      { level: 3, rounds: 3, size: 5, secondsPerRound: 0 },
      { level: 4, rounds: 3, size: 6, secondsPerRound: 45 },
      { level: 5, rounds: 4, size: 7, secondsPerRound: 40 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const CATALOG: Exercise[] = [...COGNITIVE, ...MOTOR];

const BY_ID = new Map(CATALOG.map((exercise) => [exercise.id, exercise]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function requireExercise(id: string): Exercise {
  const exercise = BY_ID.get(id);
  if (!exercise) throw new Error(`Unknown exercise: ${id}`);
  return exercise;
}

export function getLevel(exercise: Exercise, level: Level) {
  // Levels are ordered 1–5 in every definition, so the index is the level - 1.
  // Falling back to the last rung keeps a malformed level from throwing during
  // a session; the guardrail layer has already clamped anything out of range.
  return exercise.levels[level - 1] ?? exercise.levels[exercise.levels.length - 1];
}

/**
 * Rough minutes an exercise takes at a level.
 *
 * Used to keep a proposed set inside the practitioner's time ceiling, and to
 * tell the patient how long today will take. It is deliberately not just the
 * movement time: a session includes reading the instruction, getting the camera
 * to see you, and resting between repetitions. A patient told "about two
 * minutes" who then spends eight will stop trusting the number, so the estimate
 * carries a fixed setup allowance and a rest allowance per repetition.
 */
export function estimateMinutes(exercise: Exercise, level: Level): number {
  const rung = getLevel(exercise, level);

  if (isMotor(exercise)) {
    const motorRung = rung as { reps: number; holdSeconds: number };
    // Getting into position and hearing the instruction, before any movement.
    const setupSeconds = 45;
    // Four seconds of movement, the hold, then a couple of seconds to recover.
    const perRep = 4 + motorRung.holdSeconds + 2;
    return (setupSeconds + motorRung.reps * perRep) / 60;
  }

  const cogRung = rung as { rounds: number; secondsPerRound: number };
  const setupSeconds = 20;
  // An untimed round still takes a while; 45 seconds is a fair middle for
  // someone working at their own pace.
  const perRound = cogRung.secondsPerRound || 45;
  return (setupSeconds + cogRung.rounds * perRound) / 60;
}

/** Plain-language names for tags, for the practitioner's rule editor. */
export const TAG_LABELS: Record<ExerciseTag, string> = {
  overhead_reach: "Reaching overhead",
  weight_bearing: "Taking weight through the legs",
  balance: "Balance demand",
  fine_motor: "Fine hand movement",
  bilateral: "Uses both sides",
  sustained_attention: "Sustained attention",
  language: "Language",
  working_memory: "Working memory",
  processing_speed: "Processing speed",
};

export { MOTOR as MOTOR_EXERCISES, COGNITIVE as COGNITIVE_EXERCISES };
