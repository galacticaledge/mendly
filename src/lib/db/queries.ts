/**
 * Everything the application asks of the database.
 *
 * Route handlers call these; they do not write SQL. One rule is enforced here
 * rather than in the UI: `getDeliverableSet` will only ever return an exercise
 * set a practitioner has approved. A patient screen cannot accidentally start a
 * session on an AI proposal, because there is no query that would return one.
 */

import "server-only";
import { query, queryOne, transaction } from "@/lib/db/client";
import type {
  AlertSeverity,
  ExerciseResult,
  ExerciseSetStatus,
  GuardrailViolation,
  Level,
  PractitionerRules,
  ProposedExercise,
  SafetyAlert,
  SessionAnswer,
  UiProfile,
} from "@/lib/contracts";

/* ---------------------------------------------------------------- */
/* People                                                            */
/* ---------------------------------------------------------------- */

export type PractitionerRow = {
  id: string;
  email: string;
  full_name: string;
  role_title: string;
  password_hash: string;
};

export type PatientRow = {
  id: string;
  practitioner_id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  stroke_type: string;
  affected_side: "left" | "right" | "both";
  diagnosis_date: Date | null;
  history: string;
  /** The patient's Backboard thread, or null before their first proposal. */
  backboard_thread_id: string | null;
  ui_profile: UiProfile;
};

export function findPractitionerByEmail(email: string) {
  return queryOne<PractitionerRow>(
    `SELECT * FROM practitioners WHERE lower(email) = lower($1)`,
    [email],
  );
}

export function findPatientByEmail(email: string) {
  return queryOne<PatientRow>(`SELECT * FROM patients WHERE lower(email) = lower($1)`, [email]);
}

export function getPatient(id: string) {
  return queryOne<PatientRow>(`SELECT * FROM patients WHERE id = $1`, [id]);
}

export function getPractitioner(id: string) {
  return queryOne<PractitionerRow>(`SELECT * FROM practitioners WHERE id = $1`, [id]);
}

/**
 * Remember which Backboard thread belongs to this patient.
 *
 * Backboard creates the thread on the first proposal and returns its id. This
 * is the only part of the planner's memory Mendly stores — the conversation
 * itself lives in Backboard, which is the point of using it.
 */
export function setBackboardThread(patientId: string, threadId: string) {
  return query(`UPDATE patients SET backboard_thread_id = $2 WHERE id = $1`, [
    patientId,
    threadId,
  ]);
}

/** A patient belongs to exactly one practitioner; everything else is denied. */
export async function practitionerOwnsPatient(
  practitionerId: string,
  patientId: string,
): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT TRUE AS ok FROM patients WHERE id = $1 AND practitioner_id = $2`,
    [patientId, practitionerId],
  );
  return row !== null;
}

export type PatientListItem = {
  id: string;
  first_name: string;
  last_name: string;
  affected_side: string;
  stroke_type: string;
  last_session_at: Date | null;
  sets_awaiting_review: number;
  open_alerts: number;
  urgent_alerts: number;
};

/**
 * The practitioner dashboard's one query: every patient with the three numbers
 * that decide who needs attention first.
 */
export function listPatientsForPractitioner(practitionerId: string) {
  return query<PatientListItem>(
    `SELECT
       p.id, p.first_name, p.last_name, p.affected_side, p.stroke_type,
       (SELECT max(started_at) FROM sessions s WHERE s.patient_id = p.id) AS last_session_at,
       (SELECT count(*) FROM exercise_sets es
          WHERE es.patient_id = p.id AND es.status = 'proposed')::int AS sets_awaiting_review,
       (SELECT count(*) FROM alerts a
          WHERE a.patient_id = p.id AND a.acknowledged_at IS NULL)::int AS open_alerts,
       (SELECT count(*) FROM alerts a
          WHERE a.patient_id = p.id AND a.acknowledged_at IS NULL
            AND a.severity = 'urgent')::int AS urgent_alerts
     FROM patients p
     WHERE p.practitioner_id = $1
     ORDER BY urgent_alerts DESC, open_alerts DESC, p.first_name`,
    [practitionerId],
  );
}

/* ---------------------------------------------------------------- */
/* Rules                                                             */
/* ---------------------------------------------------------------- */

export type RulesRow = { id: string; payload: PractitionerRules; created_at: Date };

/** The rules in force for a patient: the most recent version. */
export function getCurrentRules(patientId: string) {
  return queryOne<RulesRow>(
    `SELECT id, payload, created_at FROM rules
     WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [patientId],
  );
}

/** Saving rules writes a new version; earlier ones stay for the audit trail. */
export function saveRules(patientId: string, practitionerId: string, payload: PractitionerRules) {
  return queryOne<RulesRow>(
    `INSERT INTO rules (patient_id, practitioner_id, payload)
     VALUES ($1, $2, $3)
     RETURNING id, payload, created_at`,
    [patientId, practitionerId, JSON.stringify(payload)],
  );
}

/* ---------------------------------------------------------------- */
/* Exercise sets                                                     */
/* ---------------------------------------------------------------- */

export type ExerciseSetRow = {
  id: string;
  patient_id: string;
  rules_id: string | null;
  status: ExerciseSetStatus;
  proposed_exercises: ProposedExercise[];
  ai_summary: string;
  ai_source: string;
  violations: GuardrailViolation[];
  approved_exercises: ProposedExercise[] | null;
  practitioner_notes: string;
  reviewed_at: Date | null;
  created_at: Date;
};

export function createProposal(input: {
  patientId: string;
  rulesId: string | null;
  exercises: ProposedExercise[];
  summary: string;
  source: string;
  violations: GuardrailViolation[];
}) {
  return queryOne<ExerciseSetRow>(
    `INSERT INTO exercise_sets
       (patient_id, rules_id, proposed_exercises, ai_summary, ai_source, violations)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.patientId,
      input.rulesId,
      JSON.stringify(input.exercises),
      input.summary,
      input.source,
      JSON.stringify(input.violations),
    ],
  );
}

export function getExerciseSet(id: string) {
  return queryOne<ExerciseSetRow>(`SELECT * FROM exercise_sets WHERE id = $1`, [id]);
}

export function listExerciseSets(patientId: string, limit = 20) {
  return query<ExerciseSetRow>(
    `SELECT * FROM exercise_sets WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [patientId, limit],
  );
}

export function listSetsAwaitingReview(practitionerId: string) {
  return query<ExerciseSetRow & { first_name: string; last_name: string }>(
    `SELECT es.*, p.first_name, p.last_name
     FROM exercise_sets es
     JOIN patients p ON p.id = es.patient_id
     WHERE p.practitioner_id = $1 AND es.status = 'proposed'
     ORDER BY es.created_at ASC`,
    [practitionerId],
  );
}

/**
 * The practitioner's decision. `exercises` is what they are approving, which
 * may differ from what the AI proposed — that is the point of the review step,
 * and both versions stay on the row.
 */
export function reviewExerciseSet(input: {
  setId: string;
  practitionerId: string;
  status: Extract<ExerciseSetStatus, "approved" | "rejected">;
  exercises: ProposedExercise[] | null;
  notes: string;
}) {
  return queryOne<ExerciseSetRow>(
    `UPDATE exercise_sets
     SET status = $2,
         approved_exercises = $3,
         practitioner_notes = $4,
         reviewed_by = $5,
         reviewed_at = now()
     WHERE id = $1 AND status = 'proposed'
     RETURNING *`,
    [
      input.setId,
      input.status,
      input.exercises ? JSON.stringify(input.exercises) : null,
      input.notes,
      input.practitionerId,
    ],
  );
}

/**
 * The set a patient may actually start, or null.
 *
 * The status check is the guardrail that matters most in this file: an AI
 * proposal has status 'proposed' and can never be returned here, so no patient
 * screen can start a session on an unreviewed set even by mistake.
 */
export function getDeliverableSet(patientId: string) {
  return queryOne<ExerciseSetRow>(
    `SELECT * FROM exercise_sets
     WHERE patient_id = $1 AND status = 'approved' AND approved_exercises IS NOT NULL
     ORDER BY reviewed_at DESC LIMIT 1`,
    [patientId],
  );
}

export function markSetCompleted(setId: string) {
  return query(`UPDATE exercise_sets SET status = 'completed' WHERE id = $1`, [setId]);
}

/* ---------------------------------------------------------------- */
/* Sessions and results                                              */
/* ---------------------------------------------------------------- */

export type SessionRow = {
  id: string;
  patient_id: string;
  exercise_set_id: string;
  status: "in_progress" | "completed" | "abandoned";
  started_at: Date;
  ended_at: Date | null;
};

export function startSessionRow(patientId: string, exerciseSetId: string) {
  return queryOne<SessionRow>(
    `INSERT INTO sessions (patient_id, exercise_set_id) VALUES ($1, $2) RETURNING *`,
    [patientId, exerciseSetId],
  );
}

export function getSession(id: string) {
  return queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
}

export function getOpenSession(patientId: string) {
  return queryOne<SessionRow>(
    `SELECT * FROM sessions WHERE patient_id = $1 AND status = 'in_progress'
     ORDER BY started_at DESC LIMIT 1`,
    [patientId],
  );
}

export function endSessionRow(sessionId: string, status: "completed" | "abandoned") {
  return queryOne<SessionRow>(
    `UPDATE sessions SET status = $2, ended_at = now() WHERE id = $1 RETURNING *`,
    [sessionId, status],
  );
}

export function recordResult(input: {
  sessionId: string;
  patientId: string;
  result: ExerciseResult;
}) {
  return queryOne<{ id: string; time: Date }>(
    `INSERT INTO exercise_results (session_id, patient_id, exercise_id, modality, level, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, time`,
    [
      input.sessionId,
      input.patientId,
      input.result.exercise_id,
      input.result.modality,
      input.result.level,
      JSON.stringify(input.result),
    ],
  );
}

export type ResultRow = {
  id: string;
  time: Date;
  session_id: string;
  exercise_id: string;
  modality: "motor" | "cognitive";
  level: Level;
  payload: ExerciseResult;
};

/** Recent results for a patient, newest first. Feeds the performance profile. */
export function listRecentResults(patientId: string, limit = 50) {
  return query<ResultRow>(
    `SELECT id, time, session_id, exercise_id, modality, level, payload
     FROM exercise_results
     WHERE patient_id = $1
     ORDER BY time DESC
     LIMIT $2`,
    [patientId, limit],
  );
}

export function listResultsForSession(sessionId: string) {
  return query<ResultRow>(
    `SELECT id, time, session_id, exercise_id, modality, level, payload
     FROM exercise_results WHERE session_id = $1 ORDER BY time ASC`,
    [sessionId],
  );
}

export async function countCompletedSessions(patientId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM sessions WHERE patient_id = $1 AND status = 'completed'`,
    [patientId],
  );
  return row?.n ?? 0;
}

/**
 * Sessions finished in the last seven days, newest first, each with how many
 * exercises it recorded and the note the practitioner left on the set it came
 * from. Feeds "what you have done this week" on the patient dashboard.
 */
export function listCompletedSessionsThisWeek(patientId: string) {
  return query<{
    id: string;
    exercise_set_id: string;
    started_at: Date;
    exercises: number;
    practitioner_notes: string;
  }>(
    `SELECT s.id, s.exercise_set_id, s.started_at,
            (SELECT count(*)::int FROM exercise_results r WHERE r.session_id = s.id) AS exercises,
            es.practitioner_notes
     FROM sessions s
     JOIN exercise_sets es ON es.id = s.exercise_set_id
     WHERE s.patient_id = $1 AND s.status = 'completed'
       AND s.started_at > now() - interval '7 days'
     ORDER BY s.started_at DESC`,
    [patientId],
  );
}

export function saveAnswers(sessionId: string, answers: (SessionAnswer & { prompt: string })[]) {
  if (answers.length === 0) return Promise.resolve([]);
  return transaction(async (client) => {
    for (const answer of answers) {
      await client.query(
        `INSERT INTO session_answers (session_id, question_id, prompt, answer)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, answer.questionId, answer.prompt, answer.answer],
      );
    }
    return [];
  });
}

export function listAnswersForSession(sessionId: string) {
  return query<{ question_id: string; prompt: string; answer: string; created_at: Date }>(
    `SELECT question_id, prompt, answer, created_at FROM session_answers
     WHERE session_id = $1 ORDER BY created_at`,
    [sessionId],
  );
}

/* ---------------------------------------------------------------- */
/* Alerts                                                            */
/* ---------------------------------------------------------------- */

export type AlertRow = {
  id: string;
  time: Date;
  patient_id: string;
  session_id: string | null;
  kind: string;
  severity: AlertSeverity;
  message: string;
  evidence: Record<string, unknown>;
  acknowledged_at: Date | null;
  first_name?: string;
  last_name?: string;
};

/**
 * Write an alert. The practitioner is resolved from the patient rather than
 * passed in, so an alert always reaches the person responsible for that
 * patient even when it is raised by a background watcher with no user context.
 */
export function raiseAlert(input: {
  patientId: string;
  sessionId: string | null;
  alert: SafetyAlert;
}) {
  return queryOne<AlertRow>(
    `INSERT INTO alerts (patient_id, practitioner_id, session_id, kind, severity, message, evidence)
     SELECT $1, p.practitioner_id, $2, $3, $4, $5, $6
     FROM patients p WHERE p.id = $1
     RETURNING *`,
    [
      input.patientId,
      input.sessionId,
      input.alert.kind,
      input.alert.severity,
      input.alert.message,
      JSON.stringify(input.alert.evidence),
    ],
  );
}

export function listAlerts(practitionerId: string, options: { openOnly?: boolean; limit?: number } = {}) {
  const { openOnly = false, limit = 50 } = options;
  return query<AlertRow>(
    `SELECT a.*, p.first_name, p.last_name
     FROM alerts a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.practitioner_id = $1
       ${openOnly ? "AND a.acknowledged_at IS NULL" : ""}
     ORDER BY a.time DESC
     LIMIT $2`,
    [practitionerId, limit],
  );
}

export function listAlertsForPatient(patientId: string, limit = 20) {
  return query<AlertRow>(
    `SELECT * FROM alerts WHERE patient_id = $1 ORDER BY time DESC LIMIT $2`,
    [patientId, limit],
  );
}

/** Alerts raised since a timestamp. Drives the dashboard's live feed. */
export function listAlertsSince(practitionerId: string, since: Date) {
  return query<AlertRow>(
    `SELECT a.*, p.first_name, p.last_name
     FROM alerts a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.practitioner_id = $1 AND a.time > $2
     ORDER BY a.time ASC`,
    [practitionerId, since],
  );
}

export function acknowledgeAlert(alertId: string, practitionerId: string) {
  return queryOne<AlertRow>(
    `UPDATE alerts SET acknowledged_at = now()
     WHERE id = $1 AND practitioner_id = $2 AND acknowledged_at IS NULL
     RETURNING *`,
    [alertId, practitionerId],
  );
}
