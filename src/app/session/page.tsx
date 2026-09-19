import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDeliverableSet, getOpenSession, getPatient, listResultsForSession, startSessionRow } from "@/lib/db/queries";
import { buildPlan, SESSION_QUESTIONS } from "@/lib/session/plan";
import { hasFinishedToday } from "@/lib/patient/dashboard";
import { SessionRunner } from "./SessionRunner";

export const metadata = { title: "Your session — Mendly" };

/**
 * The session page.
 *
 * It opens the session row here rather than on the dashboard, so a session
 * exists only once someone has actually arrived at the exercises. An open
 * session is reused, which is what makes closing the tab and coming back work.
 */
export default async function SessionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "patient") redirect("/practitioner");

  const patient = await getPatient(user.id);
  if (!patient) redirect("/sign-in");

  const set = await getDeliverableSet(user.id);
  // Only an approved set can be started, and this is the only page that starts
  // one. With nothing approved there is nothing to do but go back.
  if (!set?.approved_exercises) redirect("/");

  // Built before a session row is opened, because a set that resolves to
  // nothing must not leave an in-progress session behind on its way out.
  //
  // An id the catalog no longer knows is dropped by buildPlan, so an otherwise
  // valid approved set can come through with no exercises in it. Greying the
  // dashboard action covers the way most people arrive; this covers a bookmark,
  // the back button and a typed URL. It is logged because it means a
  // practitioner approved something the patient cannot be given, and nobody
  // would otherwise find out.
  const plan = buildPlan(set.approved_exercises);
  if (plan.length === 0) {
    console.warn(
      `[mendly] set ${set.id} is approved with ${set.approved_exercises.length} exercise(s), ` +
        `none of which are in the catalog. There is nothing to run.`,
    );
    redirect("/");
  }

  // An open session is always resumable. Starting a *new* one is not, once
  // today's is finished: a practitioner can have several sets approved and
  // waiting, and without this, completing one promotes the next immediately
  // and the person can work through a week of approved sets in an evening.
  // The dashboard greys the action for this; this covers a typed URL.
  const open = await getOpenSession(user.id);
  if (!open && (await hasFinishedToday(user.id))) redirect("/");

  const session = open ?? (await startSessionRow(user.id, set.id));
  if (!session) redirect("/");

  const completed = (await listResultsForSession(session.id)).map((row) => row.exercise_id);

  return (
    <SessionRunner
      sessionId={session.id}
      plan={plan}
      completedExerciseIds={completed}
      affectedSide={patient.affected_side}
      firstName={patient.first_name}
      practitionerNotes={set.practitioner_notes}
      questions={SESSION_QUESTIONS.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices,
      }))}
      uiProfile={patient.ui_profile}
    />
  );
}
