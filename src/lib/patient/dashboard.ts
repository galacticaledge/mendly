import "server-only";
import type { ExerciseResult, UiProfile } from "@/lib/contracts";
import {
  countCompletedSessions,
  getDeliverableSet,
  getOpenSession,
  getPatient,
  listAlertsForPatient,
  listCompletedSessionsThisWeek,
  listRecentResults,
  listResultsForSession,
} from "@/lib/db/queries";
import { buildPlan, totalMinutes } from "@/lib/session/plan";
import type { PlannedExercise } from "@/lib/session/plan";

/**
 * Everything the Today page shows, in one call.
 *
 * The page answers four questions and then stops: what to do today, how the
 * week is going, what is already done, what is next. This assembles exactly
 * that and nothing else — there is no analytics payload here, because the
 * dashboard is not the product.
 */

export type PatientDashboard = {
  firstName: string;
  uiProfile: UiProfile;
  dateLabel: string;
  /** Null when the practitioner has not approved anything yet. */
  today: {
    setId: string;
    sessionId: string | null;
    plan: PlannedExercise[];
    completedExerciseIds: string[];
    minutes: number;
    notes: string;
  } | null;
  /**
   * Whether a session has already been finished today.
   *
   * A practitioner can have several sets approved and waiting, and finishing
   * one used to promote the next the instant its status changed — so a patient
   * who had just finished could be offered a fresh set of exercises on the same
   * screen, seconds later. One session is one day's work.
   */
  completedToday: boolean;
  week: { label: string; done: boolean; isToday: boolean }[];
  sessionsThisWeek: number;
  sessionsCompletedAllTime: number;
  lastResults: { exerciseId: string; name: string; line: string; at: Date }[];
};

const DAY_MS = 864e5;

function label(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** One line describing how an exercise went, in the person's own terms. */
function resultLine(result: ExerciseResult): string {
  if (result.modality === "motor") {
    return `${result.valid_reps} of ${result.target_reps} done, average reach ${Math.round(result.rom_mean_deg)} degrees`;
  }
  return `${Math.round(result.accuracy * 100)} out of 100 correct`;
}

/**
 * Whether this patient has already finished a session today.
 *
 * Bucketed in local time, like the week above and for the same reason: an
 * evening session bucketed by the database in UTC lands on tomorrow.
 */
export async function hasFinishedToday(patientId: string): Promise<boolean> {
  const finished = await listCompletedSessionsThisWeek(patientId);
  const today = new Date().toDateString();
  return finished.some((row) => new Date(row.started_at).toDateString() === today);
}

export async function loadDashboard(patientId: string): Promise<PatientDashboard | null> {
  const patient = await getPatient(patientId);
  if (!patient) return null;

  const set = await getDeliverableSet(patientId);
  const open = await getOpenSession(patientId);

  let today: PatientDashboard["today"] = null;
  if (set?.approved_exercises) {
    const plan = buildPlan(set.approved_exercises);
    const done = open ? (await listResultsForSession(open.id)).map((row) => row.exercise_id) : [];
    today = {
      setId: set.id,
      sessionId: open?.id ?? null,
      plan,
      completedExerciseIds: done,
      minutes: totalMinutes(plan),
      notes: set.practitioner_notes,
    };
  }

  const finished = await listCompletedSessionsThisWeek(patientId);

  // Seven days ending today, so "your week" is a rolling week rather than one
  // that resets on a Monday and makes Sunday look empty. Days are bucketed
  // here, in the same timezone as the labels, not by date_trunc in the
  // database, which works in UTC and can move a session onto the wrong day.
  const doneDays = new Set(finished.map((row) => new Date(row.started_at).toDateString()));
  const now = new Date();
  const completedToday = doneDays.has(now.toDateString());
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * DAY_MS);
    return {
      label: date.toLocaleDateString("en-GB", { weekday: "long" }),
      done: doneDays.has(date.toDateString()),
      isToday: i === 6,
    };
  });

  const recent = await listRecentResults(patientId, 6);

  return {
    firstName: patient.first_name,
    uiProfile: patient.ui_profile,
    completedToday,
    dateLabel: label(now),
    today,
    week,
    sessionsThisWeek: week.filter((day) => day.done).length,
    sessionsCompletedAllTime: await countCompletedSessions(patientId),
    lastResults: recent.map((row) => ({
      exerciseId: row.exercise_id,
      name: row.payload.exercise_id,
      line: resultLine(row.payload),
      at: row.time,
    })),
  };
}

export { listAlertsForPatient };
