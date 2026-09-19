/**
 * Finish a session.
 *
 * Four things happen, in this order: the session is closed, the answers to the
 * closing questions are stored, anything worrying in those answers becomes an
 * alert, and the AI drafts the next set for the practitioner to review.
 *
 * The last step is what keeps the loop turning — by the time the practitioner
 * next opens the dashboard, a draft built on today's measurements is already
 * waiting for them.
 */

import { handle, forbidden, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import type { SessionAnswer } from "@/lib/contracts";
import {
  endSessionRow,
  getSession,
  listResultsForSession,
  markSetCompleted,
  raiseAlert,
  saveAnswers,
} from "@/lib/db/queries";
import { SESSION_QUESTIONS } from "@/lib/session/plan";
import { proposeAndStore } from "@/lib/ai/propose";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("patient");
    const { id } = await context.params;

    const session = await getSession(id);
    if (!session) notFound("That session does not exist.");
    if (session.patient_id !== user.id) forbidden("That is not your session.");

    const body = (await request.json().catch(() => ({}))) as {
      answers?: SessionAnswer[];
      abandoned?: boolean;
    };

    if (session.status === "in_progress") {
      await endSessionRow(id, body.abandoned ? "abandoned" : "completed");
    }

    const answers = Array.isArray(body.answers) ? body.answers : [];
    const resolved = answers
      .map((answer) => {
        const question = SESSION_QUESTIONS.find((q) => q.id === answer.questionId);
        if (!question || typeof answer.answer !== "string") return null;
        // Only the offered choices are stored, so the answers stay comparable
        // between sessions and nothing arbitrary is written to the record.
        if (!question.choices.includes(answer.answer)) return null;
        return { questionId: question.id, prompt: question.prompt, answer: answer.answer };
      })
      .filter((item): item is { questionId: string; prompt: string; answer: string } => item !== null);

    if (resolved.length > 0) await saveAnswers(id, resolved);

    // Pain, dizziness or "too hard" go to the practitioner as an alert rather
    // than sitting in a record nobody opens until the next appointment.
    for (const answer of resolved) {
      const question = SESSION_QUESTIONS.find((q) => q.id === answer.questionId);
      if (!question?.flagChoices?.includes(answer.answer)) continue;
      await raiseAlert({
        patientId: user.id,
        sessionId: id,
        alert: {
          kind: "patient_reported_pain",
          severity: "attention",
          message: `${user.name} answered "${answer.answer}" to: ${question.prompt}`,
          evidence: { question: question.id, answer: answer.answer },
        },
      });
    }

    if (!body.abandoned) {
      await markSetCompleted(session.exercise_set_id);
    }

    const results = await listResultsForSession(id);

    // Draft the next set from what was just measured. A failure here must not
    // fail the request: the patient has finished their session either way, and
    // the practitioner can ask for a draft themselves.
    let nextSetId: string | null = null;
    try {
      const { row } = await proposeAndStore(user.id);
      nextSetId = row?.id ?? null;
    } catch (error) {
      console.error("[mendly] Could not draft the next set:", error);
    }

    return {
      completed: true,
      exercisesRecorded: results.length,
      nextSetId,
    };
  });
}
