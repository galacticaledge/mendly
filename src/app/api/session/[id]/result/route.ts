/**
 * Record one finished exercise, and say what happens to the next one.
 *
 * This is the CV-to-AI boundary in practice: a completed, validated result
 * arrives here, and the answer is a difficulty decision for the same exercise
 * next time. No per-frame data crosses this line (docs/08).
 */

import { handle, badRequest, forbidden, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { adaptLevel } from "@/lib/ai/adapt";
import { DEFAULT_RULES } from "@/lib/ai/propose";
import { getCurrentRules, getExerciseSet, getSession, recordResult } from "@/lib/db/queries";
import { validateResult } from "@/lib/session/validateResult";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("patient");
    const { id } = await context.params;

    const session = await getSession(id);
    if (!session) notFound("That session does not exist.");
    if (session.patient_id !== user.id) forbidden("That is not your session.");
    if (session.status !== "in_progress") badRequest("That session has already finished.");

    const set = await getExerciseSet(session.exercise_set_id);
    if (!set?.approved_exercises) badRequest("This session has no approved exercises.");

    const allowed = set.approved_exercises.map((item) => ({
      exerciseId: item.exerciseId,
      level: item.level,
    }));

    const checked = validateResult(await request.json(), allowed);
    if (!checked.ok) badRequest(checked.error);

    await recordResult({ sessionId: id, patientId: user.id, result: checked.result });

    const rules = (await getCurrentRules(user.id))?.payload ?? DEFAULT_RULES;
    const adaptation = adaptLevel(checked.result, rules);

    return { recorded: true, adaptation };
  });
}
