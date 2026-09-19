/**
 * The AI pipeline, end to end.
 *
 *   patient data + progress + scores
 *     → performance profile        (run through the data)
 *     → Backboard, routed to Gemini (recommend a set)
 *     → guardrails                 (run validation)
 *     → stored as 'proposed'       (send it back to the requester)
 *     → practitioner review        (the step no code can skip)
 *
 * Backboard is the only LLM client. It keeps the planner's conversation and
 * memory per patient, so Mendly does not carry an AI memory layer of its own —
 * only the thread id that addresses it. When Backboard is unreachable or
 * unconfigured, the local rules engine drafts the set instead, because a
 * patient waiting on an exercise session should not be blocked by an API.
 *
 * Nothing here delivers anything to a patient. The output is a row awaiting
 * human review, which is the whole design (docs/practitioner_guardrails_flow).
 */

import "server-only";
import type { ExerciseResult, ExerciseSetProposal, GuardrailResult, PractitionerRules } from "@/lib/contracts";
import { buildProfile } from "@/lib/ai/performance";
import { applyGuardrails } from "@/lib/ai/guardrails";
import { proposeWithBackboard, isBackboardConfigured } from "@/lib/ai/backboard";
import { proposeWithRules } from "@/lib/ai/rulesEngine";
import {
  countCompletedSessions,
  createProposal,
  getCurrentRules,
  getPatient,
  listRecentResults,
  setBackboardThread,
} from "@/lib/db/queries";

/** The rules a patient starts with before a practitioner has set any. */
export const DEFAULT_RULES: PractitionerRules = {
  allowedExerciseIds: ["card_match", "arm_raise"],
  maxLevel: { card_match: 2, arm_raise: 2 },
  standingAllowed: false,
  contraindications: [],
  maxExercisesPerSet: 4,
  maxMotorMinutes: 12,
  affectedSide: "right",
  goals: [],
  notes: "",
};

function patientSummary(patient: {
  first_name: string;
  stroke_type: string;
  affected_side: string;
  diagnosis_date: Date | null;
  history: string;
}): string {
  const weeks = patient.diagnosis_date
    ? Math.max(0, Math.round((Date.now() - patient.diagnosis_date.getTime()) / (7 * 864e5)))
    : null;
  return [
    `${patient.first_name}, ${patient.stroke_type || "stroke"}, affecting the ${patient.affected_side} side.`,
    weeks !== null ? `${weeks} week(s) since diagnosis.` : null,
    patient.history ? `History: ${patient.history}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export type ProposalOutcome = GuardrailResult & {
  /** Which engine answered, after any fallback. Shown in the review screen. */
  source: ExerciseSetProposal["source"];
  /** True when Backboard was configured but did not produce a usable answer. */
  fellBack: boolean;
};

/**
 * Produce a validated proposal for a patient. Does not write to the database;
 * `proposeAndStore` does that. Split so the proposal can be previewed.
 */
export async function proposeForPatient(patientId: string): Promise<ProposalOutcome> {
  const patient = await getPatient(patientId);
  if (!patient) throw new Error(`No such patient: ${patientId}`);

  const rulesRow = await getCurrentRules(patientId);
  const rules = rulesRow?.payload ?? DEFAULT_RULES;

  const rows = await listRecentResults(patientId, 50);
  const results: ExerciseResult[] = rows.map((row) => row.payload);
  const sessionsCompleted = await countCompletedSessions(patientId);
  const profile = buildProfile(results, sessionsCompleted);

  // The most recent result per exercise, which the rules engine uses to decide
  // each starting level.
  const lastResults = new Map<string, ExerciseResult>();
  for (const result of results) {
    if (!lastResults.has(result.exercise_id)) lastResults.set(result.exercise_id, result);
  }

  let proposal: ExerciseSetProposal | null = null;
  let fellBack = false;

  if (isBackboardConfigured()) {
    const result = await proposeWithBackboard(
      { rules, profile, patientSummary: patientSummary(patient) },
      patient.backboard_thread_id,
    );

    if (result) {
      proposal = result.proposal;
      // Backboard creates the thread on the first call. Storing the id is what
      // makes the next proposal continue the same conversation instead of
      // starting the planner over with no memory of this patient.
      if (result.threadId && result.threadId !== patient.backboard_thread_id) {
        await setBackboardThread(patientId, result.threadId);
      }
    } else {
      fellBack = true;
    }
  }

  if (!proposal) {
    proposal = proposeWithRules(rules, profile, lastResults);
  }

  // Validation runs on whatever produced the proposal. The rules engine is
  // already confined to the pool, but it goes through the same check anyway:
  // one path to a patient means one place where the rules are enforced.
  const checked = applyGuardrails(proposal, rules);

  return { ...checked, source: proposal.source, fellBack };
}

/** Produce a proposal and store it, awaiting practitioner review. */
export async function proposeAndStore(patientId: string) {
  const outcome = await proposeForPatient(patientId);
  const rulesRow = await getCurrentRules(patientId);

  const row = await createProposal({
    patientId,
    rulesId: rulesRow?.id ?? null,
    exercises: outcome.proposal.exercises,
    summary: outcome.proposal.summary,
    source: outcome.source,
    violations: outcome.violations,
  });

  return { row, outcome };
}
