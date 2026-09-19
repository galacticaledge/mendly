import { handle, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { acknowledgeAlert } from "@/lib/db/queries";

/** Mark an alert as seen. Only the practitioner it was raised for may do this. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const { id } = await context.params;
    const row = await acknowledgeAlert(id, user.id);
    if (!row) notFound("That alert is not open, or is not yours.");
    return { alert: row };
  });
}
