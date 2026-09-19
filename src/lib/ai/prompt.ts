/**
 * The planning prompt, shared by every provider.
 *
 * Backboard and the direct Gemini client must ask the model exactly the same
 * question, or a proposal would depend on which route happened to be
 * configured — and a practitioner comparing two drafts would have no way to
 * tell whether a difference came from the patient's data or from the plumbing.
 * So the instruction, the context and the parsing all live here, and a provider
 * module is only responsible for the HTTP call.
 *
 * The model is asked for one thing only: which exercises from a supplied list,
 * at which level, and why. It is never given free text to act on, never asked
 * to invent an exercise, and never given raw video (docs/05). Its answer is a
 * suggestion that still has to pass the guardrails and then a human.
 */

import type { ExerciseSetProposal, Level, PractitionerRules } from "@/lib/contracts";
import type { PerformanceProfile } from "@/lib/ai/performance";
import { isMotor } from "@/lib/contracts";
import { getExercise, getLevel } from "@/lib/exercises/catalog";

export const SYSTEM_INSTRUCTION = `
You are the exercise-planning assistant inside Mendly, a stroke rehabilitation platform.

Your only task is to choose which of the exercises OFFERED BELOW a patient should do
next, and at what level, then explain your choices to their practitioner.

Hard rules:
- Choose only from the offered exercise ids. Never output an id that is not offered.
- Never exceed the stated maximum level for an exercise.
- Never exceed the stated maximum number of exercises.
- You are not prescribing treatment. You are selecting from a set a practitioner has
  already approved for this patient, and a practitioner reviews your answer before the
  patient sees it.
- Write every rationale in one plain sentence a practitioner can check at a glance.
- If tracking confidence for a previous attempt was low, do not read low numbers as
  poor performance. Hold the level and say the measurement was unreliable.
- Prefer steady progress over large jumps. Move a level by one step at a time.
- Put exercises done at the screen before exercises done standing up.
`.trim();

/**
 * The answer shape, written out for providers that cannot enforce a schema.
 *
 * Gemini's own API takes a real `responseSchema` and does not need this.
 * Backboard's `json_output` flag guarantees valid JSON but not a particular
 * shape, so there the shape has to be asked for in words — and checked on the
 * way back, which `parseProposal` does.
 */
export const RESPONSE_SHAPE_INSTRUCTION = `
Reply with a single JSON object and nothing else. No markdown fence, no commentary.

{
  "summary": "One short paragraph explaining the set as a whole, for the practitioner.",
  "exercises": [
    {
      "exerciseId": "an id from the offered list, exactly as written",
      "level": 1,
      "rationale": "one sentence"
    }
  ]
}
`.trim();

export type PlanningContext = {
  rules: PractitionerRules;
  profile: PerformanceProfile;
  patientSummary: string;
};

/** Describe exactly the exercises this patient is allowed, and nothing else. */
function describePool(rules: PractitionerRules): string {
  return rules.allowedExerciseIds
    .map((id) => {
      const exercise = getExercise(id);
      if (!exercise) return null;
      const cap = rules.maxLevel[id] ?? 1;
      const rung = getLevel(exercise, cap);
      const detail = isMotor(exercise)
        ? `movement, ${exercise.posture}, measures the ${exercise.joint.name}; at level ${cap} that is ` +
          `${(rung as { reps: number }).reps} repetitions through ` +
          `${(rung as { targetRomDeg: number }).targetRomDeg}°`
        : `at the screen, ${exercise.focus.toLowerCase()}`;
      return `- ${id} — "${exercise.name}" (${detail}). Maximum level for this patient: ${cap}.`;
    })
    .filter(Boolean)
    .join("\n");
}

function describePerformance(profile: PerformanceProfile): string {
  if (profile.byExercise.length === 0) {
    return "No measured attempts yet. This is the patient's first set.";
  }
  const lines = profile.byExercise.map(
    (p) => `- ${p.exerciseId} ("${p.name}"): ${p.summary}. Attempts on record: ${p.attempts}.`,
  );
  return [...lines, "", ...profile.observations.map((o) => `Note: ${o}`)].join("\n");
}

export function buildPrompt({ rules, profile, patientSummary }: PlanningContext): string {
  return `
PATIENT
${patientSummary}

REHABILITATION GOALS
${rules.goals.length > 0 ? rules.goals.map((g) => `- ${g}`).join("\n") : "- None recorded."}

PRACTITIONER NOTES
${rules.notes || "None."}

CONSTRAINTS YOU MUST RESPECT
- Choose at most ${rules.maxExercisesPerSet} exercises.
- Keep total movement work under about ${rules.maxMotorMinutes} minutes.
- Standing exercises are ${rules.standingAllowed ? "allowed" : "NOT allowed"} for this patient.
- The patient's affected side is: ${rules.affectedSide}.

OFFERED EXERCISES — you may choose only from these ids
${describePool(rules)}

MEASURED PERFORMANCE SO FAR (most recent attempt per exercise)
${describePerformance(profile)}

Sessions completed to date: ${profile.sessionsCompleted}.

Choose the next set.
`.trim();
}

/**
 * Turn a model's reply into a proposal, or null if it is unusable.
 *
 * This checks SHAPE only — that there is an array of exercises with ids and
 * levels. Whether those exercises are ALLOWED is the guardrail layer's
 * decision, and it runs on this result next. Keeping the two apart matters:
 * a parser that silently dropped disallowed exercises would hide from the
 * practitioner that the model had tried to propose them.
 */
export function parseProposal(
  text: string | null | undefined,
  source: ExerciseSetProposal["source"],
): ExerciseSetProposal | null {
  if (!text) return null;

  const json = extractJsonObject(text);
  if (!json) return null;

  let parsed: { summary?: unknown; exercises?: unknown };
  try {
    parsed = JSON.parse(json) as { summary?: unknown; exercises?: unknown };
  } catch {
    return null;
  }

  if (!Array.isArray(parsed.exercises)) return null;

  const exercises = parsed.exercises
    .filter(
      (item): item is { exerciseId: string; level?: unknown; rationale?: unknown } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { exerciseId?: unknown }).exerciseId === "string",
    )
    .map((item) => ({
      exerciseId: item.exerciseId,
      level: (Number(item.level) || 1) as Level,
      rationale: typeof item.rationale === "string" ? item.rationale : "No reason given.",
    }));

  if (exercises.length === 0) return null;

  return {
    exercises,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    source,
  };
}

/**
 * Find the JSON object in a reply.
 *
 * A provider with real JSON mode returns bare JSON and the first branch takes
 * it. Without schema enforcement a model still sometimes wraps its answer in a
 * ```json fence or a sentence of preamble, and throwing that reply away would
 * drop a perfectly good proposal, so the outermost braces are used instead.
 */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}
