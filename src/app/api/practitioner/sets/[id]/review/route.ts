/**
 * The practitioner's decision on a proposed set.
 *
 * Approve, edit then approve, or reject. This is the step the whole design
 * exists to protect, so it is the only place in the codebase that can move a
 * set into a state a patient can start, and it records who did it and when.
 */

import { handle, badRequest, forbidden, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import type { Level, ProposedExercise } from "@/lib/contracts";
import { validatePractitionerEdit } from "@/lib/ai/guardrails";
import {
  getCurrentRules,
  getExerciseSet,
  practitionerOwnsPatient,
  reviewExerciseSet,
  saveRules,
} from "@/lib/db/queries";
import { DEFAULT_RULES } from "@/lib/ai/propose";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const { id } = await context.params;

    const set = await getExerciseSet(id);
    if (!set) notFound("That exercise set does not exist.");
    if (!(await practitionerOwnsPatient(user.id, set.patient_id))) {
      forbidden("That patient is not on your caseload.");
    }
    if (set.status !== "proposed") badRequest("That set has already been reviewed.");

    const body = (await request.json()) as {
      decision?: "approve" | "reject";
      exercises?: ProposedExercise[];
      notes?: string;
    };
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : "";

    if (body.decision === "reject") {
      const row = await reviewExerciseSet({
        setId: id,
        practitionerId: user.id,
        status: "rejected",
        exercises: null,
        notes,
      });
      return { set: row };
    }

    if (body.decision !== "approve") badRequest("The decision must be approve or reject.");

    // What they approve may differ from what was proposed — that is the point
    // of the review. Absent edits, the AI's proposal is what gets approved.
    const edited = Array.isArray(body.exercises) ? body.exercises : set.proposed_exercises;
    const checked = validatePractitionerEdit(edited);
    if (!checked.ok) badRequest(checked.error);

    const row = await reviewExerciseSet({
      setId: id,
      practitionerId: user.id,
      status: "approved",
      exercises: checked.exercises,
      notes,
    });
    if (!row) badRequest("That set has already been reviewed.");

    // A practitioner raising a level above their own earlier ceiling is them
    // changing their mind, which is theirs to do. Recording it as a new rules
    // version keeps the ceiling honest: the AI may now propose that level
    // itself next time, instead of being clamped back down to a limit the
    // practitioner has already overridden by hand.
    const currentRules = (await getCurrentRules(set.patient_id))?.payload ?? DEFAULT_RULES;
    const raised: Record<string, Level> = {};
    for (const item of checked.exercises) {
      const cap = currentRules.maxLevel[item.exerciseId] ?? 1;
      if (item.level > cap) raised[item.exerciseId] = item.level;
    }

    if (Object.keys(raised).length > 0) {
      await saveRules(set.patient_id, user.id, {
        ...currentRules,
        allowedExerciseIds: [
          ...new Set([...currentRules.allowedExerciseIds, ...Object.keys(raised)]),
        ],
        maxLevel: { ...currentRules.maxLevel, ...raised },
      });
    }

    return { set: row, rulesRaised: raised };
  });
}
