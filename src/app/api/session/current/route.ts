/**
 * What the patient can do right now.
 *
 * Returns the approved set waiting for them, the session already in progress if
 * there is one, and nothing at all if their practitioner has not approved
 * anything yet — which is a normal state, not an error.
 */

import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDeliverableSet, getOpenSession, listResultsForSession } from "@/lib/db/queries";
import { buildPlan, totalMinutes } from "@/lib/session/plan";

export async function GET() {
  return handle(async () => {
    const user = await requireUser("patient");

    const set = await getDeliverableSet(user.id);
    if (!set || !set.approved_exercises) {
      return { set: null, session: null, plan: [] };
    }

    const plan = buildPlan(set.approved_exercises);
    const open = await getOpenSession(user.id);
    // Exercises already recorded in an open session, so a patient who closed
    // the tab resumes where they stopped instead of starting again.
    const done = open ? (await listResultsForSession(open.id)).map((row) => row.exercise_id) : [];

    return {
      set: { id: set.id, notes: set.practitioner_notes, reviewedAt: set.reviewed_at },
      session: open ? { id: open.id, startedAt: open.started_at } : null,
      plan,
      completedExerciseIds: done,
      totalMinutes: totalMinutes(plan),
    };
  });
}
