/**
 * The practitioner's boundaries for one patient.
 *
 * This is the intake step of the guardrail flow: the approved pool, the level
 * ceilings, what the patient must not be asked to do, and the goals that steer
 * the AI's choices. Saving writes a new version rather than overwriting, so a
 * set approved last month can still be read against the rules of the time.
 */

import { handle, badRequest, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import type { ExerciseTag, Level, PractitionerRules } from "@/lib/contracts";
import { getCurrentRules, practitionerOwnsPatient, saveRules } from "@/lib/db/queries";
import { getExercise, TAG_LABELS } from "@/lib/exercises/catalog";
import { DEFAULT_RULES } from "@/lib/ai/propose";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const { id } = await context.params;
    if (!(await practitionerOwnsPatient(user.id, id))) {
      forbidden("That patient is not on your caseload.");
    }
    const row = await getCurrentRules(id);
    return { rules: row?.payload ?? DEFAULT_RULES, updatedAt: row?.created_at ?? null };
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const { id } = await context.params;
    if (!(await practitionerOwnsPatient(user.id, id))) {
      forbidden("That patient is not on your caseload.");
    }

    const body = (await request.json()) as Partial<PractitionerRules>;

    const allowedExerciseIds = (Array.isArray(body.allowedExerciseIds) ? body.allowedExerciseIds : [])
      .filter((exerciseId) => typeof exerciseId === "string" && getExercise(exerciseId));
    if (allowedExerciseIds.length === 0) {
      badRequest("Choose at least one exercise for this patient.");
    }

    // A ceiling is kept only for an exercise that is actually in the pool, so
    // removing an exercise cannot leave a stale permission behind for it.
    const maxLevel: Record<string, Level> = {};
    for (const exerciseId of allowedExerciseIds) {
      const raw = Number(body.maxLevel?.[exerciseId] ?? 1);
      maxLevel[exerciseId] = (Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 5) : 1) as Level;
    }

    const contraindications = (Array.isArray(body.contraindications) ? body.contraindications : [])
      .filter((tag): tag is ExerciseTag => typeof tag === "string" && tag in TAG_LABELS);

    const rules: PractitionerRules = {
      allowedExerciseIds,
      maxLevel,
      contraindications,
      standingAllowed: Boolean(body.standingAllowed),
      maxExercisesPerSet: Math.min(Math.max(Number(body.maxExercisesPerSet) || 4, 1), 8),
      maxMotorMinutes: Math.min(Math.max(Number(body.maxMotorMinutes) || 12, 1), 60),
      affectedSide:
        body.affectedSide === "left" || body.affectedSide === "both" ? body.affectedSide : "right",
      goals: (Array.isArray(body.goals) ? body.goals : [])
        .filter((goal): goal is string => typeof goal === "string" && goal.trim().length > 0)
        .map((goal) => goal.trim().slice(0, 200))
        .slice(0, 8),
      notes: typeof body.notes === "string" ? body.notes.slice(0, 4000) : "",
    };

    const row = await saveRules(id, user.id, rules);
    return { rules: row?.payload, updatedAt: row?.created_at };
  });
}
