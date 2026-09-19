import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDeliverableSet, getOpenSession, getPatient, listResultsForSession, startSessionRow } from "@/lib/db/queries";
import { buildPlan, SESSION_QUESTIONS } from "@/lib/session/plan";
import { ProfileScope } from "@/components/ProfileScope/ProfileScope";
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

  const open = (await getOpenSession(user.id)) ?? (await startSessionRow(user.id, set.id));
  if (!open) redirect("/");

  const completed = (await listResultsForSession(open.id)).map((row) => row.exercise_id);

  return (
    <ProfileScope profile={patient.ui_profile}>
      <SessionRunner
        sessionId={open.id}
        plan={buildPlan(set.approved_exercises)}
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
    </ProfileScope>
  );
}
