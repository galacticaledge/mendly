/**
 * Alerts: raised by a patient's session, read by their practitioner.
 *
 * POST is called by the browser-side safety watcher. Only the patient's own id
 * is used — the body cannot name a different patient — and the practitioner is
 * resolved from the patient record, so an alert always reaches the person
 * responsible for that patient.
 */

import { handle, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import type { AlertKind, AlertSeverity } from "@/lib/contracts";
import { getSession, listAlerts, raiseAlert } from "@/lib/db/queries";

const KINDS: AlertKind[] = [
  "possible_fall",
  "fall_out_of_view",
  "prolonged_floor_position",
  "tracking_lost",
  "session_abandoned",
  "patient_reported_pain",
];
const SEVERITIES: AlertSeverity[] = ["info", "attention", "urgent"];

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("patient");
    const body = (await request.json()) as {
      kind?: string;
      severity?: string;
      message?: string;
      evidence?: Record<string, unknown>;
      sessionId?: string;
    };

    if (!KINDS.includes(body.kind as AlertKind)) badRequest("Unknown alert kind.");
    if (!SEVERITIES.includes(body.severity as AlertSeverity)) badRequest("Unknown severity.");
    if (typeof body.message !== "string" || body.message.length === 0) {
      badRequest("An alert needs a message.");
    }

    // A session id is accepted only if it is this patient's own.
    let sessionId: string | null = null;
    if (body.sessionId) {
      const session = await getSession(body.sessionId);
      if (session?.patient_id === user.id) sessionId = session.id;
    }

    const row = await raiseAlert({
      patientId: user.id,
      sessionId,
      alert: {
        kind: body.kind as AlertKind,
        severity: body.severity as AlertSeverity,
        message: body.message,
        evidence: (body.evidence ?? {}) as Record<string, number | string | boolean>,
      },
    });

    return { alertId: row?.id ?? null };
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser("practitioner");
    const openOnly = new URL(request.url).searchParams.get("open") === "true";
    return { alerts: await listAlerts(user.id, { openOnly }) };
  });
}
