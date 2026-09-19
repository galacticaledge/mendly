import "server-only";
import type { ExerciseResult } from "@/lib/contracts";
import {
  countCompletedSessions,
  getDeliverableSet,
  getOpenSession,
  getPatient,
  listAlertsForPatient,
  listRecentResults,
  listResultsForSession,
  weekSummary,
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

  // Seven days ending today, so "your week" is a rolling week rather than one
  // that resets on a Monday and makes Sunday look empty.
  const days = await weekSummary(patientId);
  const doneByDay = new Map(
    days.map((row) => [new Date(row.day).toDateString(), row.completed > 0]),
  );
  const now = new Date();
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * DAY_MS);
    return {
      label: date.toLocaleDateString("en-GB", { weekday: "long" }),
      done: doneByDay.get(date.toDateString()) ?? false,
      isToday: i === 6,
    };
  });

  const recent = await listRecentResults(patientId, 6);

  return {
    firstName: patient.first_name,
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
