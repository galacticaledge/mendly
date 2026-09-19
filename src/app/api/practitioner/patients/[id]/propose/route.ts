/**
 * Ask the AI for a draft set for this patient.
 *
 * The answer is stored with status 'proposed'. Nothing about this call puts an
 * exercise in front of a patient; the practitioner still has to approve it.
 */

import { handle, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { practitionerOwnsPatient } from "@/lib/db/queries";
import { proposeAndStore } from "@/lib/ai/propose";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const { id } = await context.params;

    if (!(await practitionerOwnsPatient(user.id, id))) {
      forbidden("That patient is not on your caseload.");
    }

    const { row, outcome } = await proposeAndStore(id);
    if (!row) badRequest("The proposal could not be saved.");

    return {
      set: row,
      source: outcome.source,
      fellBack: outcome.fellBack,
      violations: outcome.violations,
    };
  });
}
