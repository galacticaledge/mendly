/**
 * Begin a session on the approved set.
 *
 * There is no way to pass in what to do: the set comes from the database, and
 * `getDeliverableSet` only returns sets a practitioner has approved. A patient
 * cannot start an AI proposal, and neither can a bug in the UI.
 */

import { handle, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDeliverableSet, getOpenSession, startSessionRow } from "@/lib/db/queries";
import { buildPlan } from "@/lib/session/plan";

export async function POST() {
  return handle(async () => {
    const user = await requireUser("patient");

    const existing = await getOpenSession(user.id);
    if (existing) {
      return { sessionId: existing.id, resumed: true };
    }

    const set = await getDeliverableSet(user.id);
    if (!set || !set.approved_exercises) {
      badRequest("Your care team has not approved a session for you yet.");
    }

    const session = await startSessionRow(user.id, set.id);
    if (!session) badRequest("The session could not be started.");

    return { sessionId: session.id, resumed: false, plan: buildPlan(set.approved_exercises) };
  });
}
