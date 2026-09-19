/**
 * The Gemini call.
 *
 * The model is asked for one thing only: which exercises from a supplied list,
 * at which level, and why. It is never given free text to act on, never asked
 * to invent an exercise, and never given raw video (docs/05). Its answer is a
 * suggestion that still has to pass the guardrails and then a human.
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { ExerciseSetProposal, Level, PractitionerRules } from "@/lib/contracts";
import type { PerformanceProfile } from "@/lib/ai/performance";
import { isMotor } from "@/lib/contracts";
import { getExercise, getLevel } from "@/lib/exercises/catalog";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SYSTEM_INSTRUCTION = `
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

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "One short paragraph explaining the set as a whole, for the practitioner.",
    },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          exerciseId: { type: Type.STRING, description: "An id from the offered list." },
          level: { type: Type.INTEGER, description: "Between 1 and the stated maximum." },
          rationale: { type: Type.STRING, description: "One sentence." },
        },
        required: ["exerciseId", "level", "rationale"],
      },
    },
  },
  required: ["summary", "exercises"],
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

export type GeminiContext = {
  rules: PractitionerRules;
  profile: PerformanceProfile;
  patientSummary: string;
};

function buildPrompt({ rules, profile, patientSummary }: GeminiContext): string {
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
 * Ask Gemini for a proposal. Returns null on any failure — a missing key, a
 * network error, a malformed answer — and the caller falls back to the
 * deterministic engine. A planning assistant being unavailable must never stop
 * a patient from exercising.
 */
export async function proposeWithGemini(context: GeminiContext): Promise<ExerciseSetProposal | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(context),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as {
      summary?: unknown;
      exercises?: { exerciseId?: unknown; level?: unknown; rationale?: unknown }[];
    };
    if (!Array.isArray(parsed.exercises)) return null;

    // Shape-check here only. Whether these exercises are ALLOWED is the
    // guardrail layer's decision, and it runs on this result next.
    const exercises = parsed.exercises
      .filter((item) => typeof item?.exerciseId === "string")
      .map((item) => ({
        exerciseId: String(item.exerciseId),
        level: (Number(item.level) || 1) as Level,
        rationale: typeof item.rationale === "string" ? item.rationale : "No reason given.",
      }));

    if (exercises.length === 0) return null;

    return {
      exercises,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      source: "gemini",
    };
  } catch (error) {
    console.error("[mendly] Gemini proposal failed, falling back to the rules engine:", error);
    return null;
  }
}
