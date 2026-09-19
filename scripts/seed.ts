/**
 * Seed data for demonstrating Mendly.
 *
 * Three patients, each parked at a different point in the loop, because the
 * interesting thing about this product is the loop rather than any one screen:
 *
 *   Sam    — a set approved and waiting. Sign in as Sam to do a session.
 *   Rosa   — six weeks of history and a fresh AI draft awaiting review.
 *   Tunde  — an open urgent alert from the safety watcher.
 *
 * Every number here is invented. It is shaped like plausible rehabilitation
 * data so the screens and the adaptation policy can be seen working; it is not
 * taken from any real person.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { getPool, query, queryOne } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { hashPassword } from "@/lib/auth/session";
import type { Level, MotorResult, PractitionerRules, UiProfile } from "@/lib/contracts";
import { getLevel, requireExercise } from "@/lib/exercises/catalog";
import { proposeAndStore } from "@/lib/ai/propose";

const PASSWORD = "mendly123";

/** Deterministic jitter, so a reseed produces the same demo every time. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * spread;
}

/**
 * A plausible motor result: a patient meeting most of the target, with range
 * of motion improving slightly over the weeks and tracking rarely perfect.
 */
function motorResult(
  exerciseId: string,
  level: Level,
  seed: number,
  progressFactor: number,
): MotorResult {
  const exercise = requireExercise(exerciseId);
  const rung = getLevel(exercise, level) as { reps: number; targetRomDeg: number };

  const romMean = Math.max(
    8,
    rung.targetRomDeg * (0.78 + 0.22 * progressFactor) + wobble(seed, 4),
  );
  const validReps = Math.max(1, Math.round(rung.reps * (0.7 + 0.3 * progressFactor)));
  const confidence = Math.min(0.98, 0.72 + 0.2 * progressFactor + wobble(seed + 7, 0.04));

  const reps = Array.from({ length: validReps }, (_, i) => ({
    rep: i + 1,
    rom_deg: Math.round((romMean + wobble(seed + i, 5)) * 10) / 10,
    duration_s: Math.round((3.2 + wobble(seed + i * 3, 0.6)) * 10) / 10,
    valid: true,
    tracking_confidence: Math.round(confidence * 100) / 100,
  }));

  const roms = reps.map((r) => r.rom_deg);

  return {
    modality: "motor",
    exercise_id: exerciseId,
    level,
    status: "completed",
    valid_reps: validReps,
    target_reps: rung.reps,
    rom_mean_deg: Math.round((roms.reduce((a, b) => a + b, 0) / roms.length) * 10) / 10,
    rom_min_deg: Math.min(...roms),
    rom_max_deg: Math.max(...roms),
    avg_rep_duration_s:
      Math.round((reps.reduce((a, r) => a + r.duration_s, 0) / reps.length) * 10) / 10,
    tracking_confidence: Math.round(confidence * 100) / 100,
    invalid_segments: seed % 5 === 0 ? 1 : 0,
    reps,
  };
}

function cognitiveResult(exerciseId: string, level: Level, seed: number, progressFactor: number) {
  const attempts = 8 + (seed % 5);
  const accuracy = Math.min(0.98, 0.6 + 0.3 * progressFactor + wobble(seed, 0.06));
  return {
    modality: "cognitive" as const,
    exercise_id: exerciseId,
    level,
    status: "completed" as const,
    accuracy: Math.round(accuracy * 100) / 100,
    avg_reaction_ms: Math.round(2600 - 900 * progressFactor + wobble(seed + 3, 250)),
    errors: Math.max(0, Math.round(attempts * (1 - accuracy))),
    attempts,
    hints_used: seed % 4 === 0 ? 1 : 0,
  };
}

async function createPractitioner(email: string, fullName: string, roleTitle: string) {
  return queryOne<{ id: string }>(
    `INSERT INTO practitioners (email, full_name, role_title, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [email, fullName, roleTitle, await hashPassword(PASSWORD)],
  );
}

async function createPatient(input: {
  practitionerId: string;
  email: string;
  firstName: string;
  lastName: string;
  strokeType: string;
  affectedSide: "left" | "right" | "both";
  weeksSince: number;
  history: string;
  uiProfile: UiProfile;
}) {
  const diagnosed = new Date(Date.now() - input.weeksSince * 7 * 864e5);
  return queryOne<{ id: string }>(
    `INSERT INTO patients
       (practitioner_id, email, first_name, last_name, password_hash,
        stroke_type, affected_side, diagnosis_date, history, ui_profile)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name,
       ui_profile = EXCLUDED.ui_profile
     RETURNING id`,
    [
      input.practitionerId,
      input.email,
      input.firstName,
      input.lastName,
      await hashPassword(PASSWORD),
      input.strokeType,
      input.affectedSide,
      diagnosed,
      input.history,
      input.uiProfile,
    ],
  );
}

/** A completed session on a given day, with its results written at that time. */
async function seedSession(input: {
  patientId: string;
  practitionerId: string;
  daysAgo: number;
  exercises: { id: string; level: Level }[];
  progressFactor: number;
  seed: number;
}) {
  const when = new Date(Date.now() - input.daysAgo * 864e5);

  const set = await queryOne<{ id: string }>(
    `INSERT INTO exercise_sets
       (patient_id, status, proposed_exercises, ai_summary, ai_source,
        approved_exercises, reviewed_by, reviewed_at, created_at)
     VALUES ($1, 'completed', $2, $3, 'rules-engine', $2, $4, $5, $5)
     RETURNING id`,
    [
      input.patientId,
      JSON.stringify(
        input.exercises.map((e) => ({
          exerciseId: e.id,
          level: e.level,
          rationale: "Seeded history.",
        })),
      ),
      "A past session, kept as history.",
      input.practitionerId,
      when,
    ],
  );
  if (!set) throw new Error("Could not create the historic exercise set.");

  const session = await queryOne<{ id: string }>(
    `INSERT INTO sessions (patient_id, exercise_set_id, status, started_at, ended_at)
     VALUES ($1, $2, 'completed', $3, $4) RETURNING id`,
    [input.patientId, set.id, when, new Date(when.getTime() + 18 * 60_000)],
  );
  if (!session) throw new Error("Could not create the historic session.");

  for (const [index, item] of input.exercises.entries()) {
    const exercise = requireExercise(item.id);
    const result =
      exercise.modality === "motor"
        ? motorResult(item.id, item.level, input.seed + index, input.progressFactor)
        : cognitiveResult(item.id, item.level, input.seed + index, input.progressFactor);

    await query(
      `INSERT INTO exercise_results
         (time, session_id, patient_id, exercise_id, modality, level, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        new Date(when.getTime() + (index + 1) * 4 * 60_000),
        session.id,
        input.patientId,
        item.id,
        exercise.modality,
        item.level,
        JSON.stringify(result),
      ],
    );
  }

  await query(
    `INSERT INTO session_answers (session_id, question_id, prompt, answer, created_at)
     VALUES ($1, 'effort', 'How hard did that feel?', $2, $3)`,
    [session.id, input.progressFactor > 0.6 ? "About right" : "Hard", when],
  );

  return session.id;
}

async function main() {
  console.log("Applying the schema...");
  await migrate();

  console.log("Clearing any previous seed...");
  // Ordered by dependency; alerts and results cascade from patients, but being
  // explicit keeps a reseed working even if a constraint changes later.
  await query(`DELETE FROM alerts`);
  await query(`DELETE FROM exercise_results`);
  await query(`DELETE FROM session_answers`);
  await query(`DELETE FROM sessions`);
  await query(`DELETE FROM exercise_sets`);
  await query(`DELETE FROM rules`);
  await query(`DELETE FROM patients`);
  await query(`DELETE FROM practitioners`);

  const practitioner = await createPractitioner(
    "amara@mendly.health",
    "Amara Osei",
    "Occupational therapist",
  );
  if (!practitioner) throw new Error("Could not create the practitioner.");

  /* ---------------- Sam: a session ready to do ---------------- */

  const sam = await createPatient({
    practitionerId: practitioner.id,
    email: "sam@example.com",
    firstName: "Sam",
    lastName: "Whitfield",
    strokeType: "Ischaemic stroke, left MCA",
    affectedSide: "right",
    weeksSince: 9,
    history: "Right-sided weakness in the arm. Sits independently. Walks short distances with a stick.",
    uiProfile: "aphasia",
  });
  if (!sam) throw new Error("Could not create Sam.");

  const samRules: PractitionerRules = {
    allowedExerciseIds: [
      "card_match",
      "symbol_sort",
      "math_drill",
      "arm_raise",
      "elbow_bend",
      "forward_reach",
      "diagonal_reach",
      "shoulder_claps",
    ],
    maxLevel: {
      card_match: 3,
      symbol_sort: 2,
      math_drill: 2,
      arm_raise: 3,
      elbow_bend: 2,
      forward_reach: 2,
      diagonal_reach: 2,
      shoulder_claps: 2,
    },
    standingAllowed: false,
    // Shoulder pain on the affected side, so overhead work is excluded by tag.
    contraindications: ["overhead_reach"],
    maxExercisesPerSet: 4,
    maxMotorMinutes: 12,
    affectedSide: "right",
    goals: ["Reach a cup on the kitchen shelf", "Hold a fork with the right hand"],
    notes:
      "Shoulder pain on the right at end range: keep below shoulder height. Fatigues after about 20 minutes. Prefers to start with the brain games.",
  };
  const samRulesRow = await queryOne<{ id: string }>(
    `INSERT INTO rules (patient_id, practitioner_id, payload) VALUES ($1, $2, $3) RETURNING id`,
    [sam.id, practitioner.id, JSON.stringify(samRules)],
  );

  await seedSession({
    patientId: sam.id,
    practitionerId: practitioner.id,
    daysAgo: 6,
    exercises: [
      { id: "card_match", level: 1 },
      { id: "arm_raise", level: 1 },
      { id: "elbow_bend", level: 1 },
    ],
    progressFactor: 0.45,
    seed: 11,
  });
  await seedSession({
    patientId: sam.id,
    practitionerId: practitioner.id,
    daysAgo: 4,
    exercises: [
      { id: "card_match", level: 2 },
      { id: "arm_raise", level: 2 },
      { id: "elbow_bend", level: 1 },
    ],
    progressFactor: 0.6,
    seed: 23,
  });
  await seedSession({
    patientId: sam.id,
    practitionerId: practitioner.id,
    daysAgo: 1,
    exercises: [
      { id: "card_match", level: 2 },
      { id: "arm_raise", level: 2 },
      { id: "forward_reach", level: 1 },
    ],
    progressFactor: 0.72,
    seed: 37,
  });

  // An approved set, so signing in as Sam leads straight into a session.
  await query(
    `INSERT INTO exercise_sets
       (patient_id, rules_id, status, proposed_exercises, ai_summary, ai_source,
        approved_exercises, practitioner_notes, reviewed_by, reviewed_at)
     VALUES ($1, $2, 'approved', $3, $4, 'rules-engine', $3, $5, $6, now())`,
    [
      sam.id,
      samRulesRow?.id ?? null,
      JSON.stringify([
        {
          exerciseId: "card_match",
          level: 2,
          rationale: "Accuracy was 82% at this level last time, so it holds while it settles.",
        },
        {
          exerciseId: "arm_raise",
          level: 3,
          rationale: "Reached the 45° target on every repetition last session, so it moves up.",
        },
        {
          exerciseId: "forward_reach",
          level: 2,
          rationale: "Completed level 1 comfortably and it works towards reaching the shelf.",
        },
      ]),
      "Three exercises, about twelve minutes. The arm raise steps up; everything else holds steady.",
      "Keep the arm below shoulder height on the reach. Stop if the shoulder is sore.",
      practitioner.id,
    ],
  );

  /* ---------------- Rosa: a draft awaiting review ---------------- */

  const rosa = await createPatient({
    practitionerId: practitioner.id,
    email: "rosa@example.com",
    firstName: "Rosa",
    lastName: "Iqbal",
    strokeType: "Haemorrhagic stroke, right hemisphere",
    affectedSide: "left",
    weeksSince: 22,
    history: "Left-sided weakness. Stands and walks indoors independently. Working on stamina and balance.",
    uiProfile: "motor_visual",
  });
  if (!rosa) throw new Error("Could not create Rosa.");

  const rosaRules: PractitionerRules = {
    allowedExerciseIds: [
      "card_match",
      "word_recall",
      "math_drill",
      "arm_raise",
      "overhead_arm_raise",
      "shoulder_flexion",
      "proprioception_match",
      "ankle_dorsiflexion",
      "seated_march",
      "sit_to_stand",
    ],
    maxLevel: {
      card_match: 4,
      word_recall: 3,
      math_drill: 3,
      arm_raise: 4,
      overhead_arm_raise: 3,
      shoulder_flexion: 3,
      proprioception_match: 2,
      ankle_dorsiflexion: 3,
      seated_march: 4,
      sit_to_stand: 3,
    },
    standingAllowed: true,
    contraindications: [],
    maxExercisesPerSet: 4,
    maxMotorMinutes: 18,
    affectedSide: "left",
    goals: ["Climb the stairs at home", "Stand long enough to make a meal"],
    notes:
      "Standing work is fine with a chair behind her. Confident, so watch that levels do not run ahead of control. " +
      "Ankle work is for the foot drop on the left; she needs reminding to turn side-on to the camera for it.",
  };
  await queryOne(
    `INSERT INTO rules (patient_id, practitioner_id, payload) VALUES ($1, $2, $3) RETURNING id`,
    [rosa.id, practitioner.id, JSON.stringify(rosaRules)],
  );

  for (const [index, daysAgo] of [16, 13, 10, 7, 4, 2].entries()) {
    await seedSession({
      patientId: rosa.id,
      practitionerId: practitioner.id,
      daysAgo,
      exercises: [
        { id: "word_recall", level: (index < 3 ? 2 : 3) as Level },
        { id: "arm_raise", level: (index < 2 ? 2 : 3) as Level },
        { id: "seated_march", level: (index < 4 ? 2 : 3) as Level },
        { id: "sit_to_stand", level: (index < 3 ? 1 : 2) as Level },
      ],
      progressFactor: 0.5 + index * 0.08,
      seed: 50 + index * 13,
    });
  }

  /* ---------------- Tunde: an open urgent alert ---------------- */

  const tunde = await createPatient({
    practitionerId: practitioner.id,
    email: "tunde@example.com",
    firstName: "Tunde",
    lastName: "Balogun",
    strokeType: "Ischaemic stroke, brainstem",
    affectedSide: "both",
    weeksSince: 5,
    history: "Unsteady on his feet and tires quickly. Lives alone, with a daughter nearby.",
    uiProfile: "standard",
  });
  if (!tunde) throw new Error("Could not create Tunde.");

  const tundeRules: PractitionerRules = {
    allowedExerciseIds: ["card_match", "symbol_sort", "math_drill", "arm_raise", "diagonal_reach"],
    maxLevel: { card_match: 2, symbol_sort: 2, math_drill: 1, arm_raise: 2, diagonal_reach: 1 },
    standingAllowed: false,
    contraindications: ["balance", "weight_bearing"],
    maxExercisesPerSet: 3,
    maxMotorMinutes: 8,
    affectedSide: "both",
    goals: ["Sit steadily for longer", "Keep track of the day"],
    notes: "Seated work only for now. Unsteady, lives alone, so anything from the camera comes to me straight away.",
  };
  await queryOne(
    `INSERT INTO rules (patient_id, practitioner_id, payload) VALUES ($1, $2, $3) RETURNING id`,
    [tunde.id, practitioner.id, JSON.stringify(tundeRules)],
  );

  const tundeSession = await seedSession({
    patientId: tunde.id,
    practitionerId: practitioner.id,
    daysAgo: 1,
    exercises: [
      { id: "card_match", level: 1 },
      { id: "arm_raise", level: 1 },
    ],
    progressFactor: 0.4,
    seed: 91,
  });

  await query(
    `INSERT INTO alerts (time, patient_id, practitioner_id, session_id, kind, severity, message, evidence)
     VALUES ($1, $2, $3, $4, 'possible_fall', 'urgent', $5, $6)`,
    [
      new Date(Date.now() - 42 * 60_000),
      tunde.id,
      practitioner.id,
      tundeSession,
      "The camera saw a sudden drop, and the person has stayed low and still since. Please check on them.",
      JSON.stringify({
        head_drop_fraction: 0.31,
        drop_over_ms: 620,
        low_for_ms: 5400,
        torso_tilt_deg: 71,
        head_y: 0.82,
        still: true,
      }),
    ],
  );

  await query(
    `INSERT INTO alerts (time, patient_id, practitioner_id, session_id, kind, severity, message, evidence)
     VALUES ($1, $2, $3, $4, 'patient_reported_pain', 'attention', $5, $6)`,
    [
      new Date(Date.now() - 3 * 864e5),
      sam.id,
      practitioner.id,
      null,
      'Sam answered "A little" to: Did anything hurt while you were exercising?',
      JSON.stringify({ question: "pain", answer: "A little" }),
    ],
  );

  /* ---------------- Drafts for review ---------------- */

  console.log("Drafting proposals for review...");
  for (const patient of [rosa, tunde]) {
    const { row, outcome } = await proposeAndStore(patient.id);
    console.log(
      `  ${patient.id}: ${outcome.proposal.exercises.length} exercise(s) via ${outcome.source}` +
        `${outcome.violations.length > 0 ? `, ${outcome.violations.length} blocked by the rules` : ""}` +
        ` → set ${row?.id}`,
    );
  }

  console.log(`
Seeded.

  Practitioner   amara@mendly.health   ${PASSWORD}
  Patient        sam@example.com       ${PASSWORD}   (a session ready to start)
  Patient        rosa@example.com      ${PASSWORD}   (six weeks of history)
  Patient        tunde@example.com     ${PASSWORD}   (an open urgent alert)
`);

  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
