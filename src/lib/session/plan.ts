/**
 * Turning an approved set into something a patient can actually do.
 *
 * The database stores a set as ids and levels. The session screen needs the
 * full definitions — instructions, landmarks, targets — so this resolves one
 * into the other, and orders the result the way the exercise flow wants it:
 * cognitive work at the screen first, then seated movement, then standing.
 *
 * The ordering matters beyond tidiness. A session starts with the camera only
 * needing a head-and-shoulders view, and the full-body view is not required
 * until the person has already settled in and the setup check has run.
 */

import type { Exercise, Level, ProposedExercise, SessionQuestion } from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";
import { estimateMinutes, getExercise } from "@/lib/exercises/catalog";

export type PlannedExercise = {
  exercise: Exercise;
  level: Level;
  rationale: string;
  minutes: number;
};

export function buildPlan(exercises: ProposedExercise[]): PlannedExercise[] {
  const planned = exercises
    .map((item) => {
      const exercise = getExercise(item.exerciseId);
      if (!exercise) return null;
      return {
        exercise,
        level: item.level,
        rationale: item.rationale,
        minutes: estimateMinutes(exercise, item.level),
      };
    })
    .filter((item): item is PlannedExercise => item !== null);

  return planned.sort((a, b) => rank(a.exercise) - rank(b.exercise));
}

function rank(exercise: Exercise): number {
  if (!isMotor(exercise)) return 0;
  return exercise.posture === "seated" ? 1 : 2;
}

export function totalMinutes(plan: PlannedExercise[]): number {
  return Math.max(1, Math.round(plan.reduce((sum, item) => sum + item.minutes, 0)));
}

/**
 * The questions asked after a session.
 *
 * Short, fixed choices, so the answers can be compared across sessions and
 * read aloud. Pain and dizziness are flagged: they are the two answers a
 * practitioner should not have to go looking for, so they raise an alert.
 */
export const SESSION_QUESTIONS: SessionQuestion[] = [
  {
    id: "effort",
    prompt: "How hard did that feel?",
    choices: ["Easy", "About right", "Hard", "Too hard"],
    flagChoices: ["Too hard"],
  },
  {
    id: "pain",
    prompt: "Did anything hurt while you were exercising?",
    choices: ["No pain", "A little", "Yes, it hurt"],
    flagChoices: ["Yes, it hurt"],
  },
  {
    id: "dizziness",
    prompt: "Did you feel dizzy or unsteady at any point?",
    choices: ["No", "A little", "Yes"],
    flagChoices: ["Yes"],
  },
  {
    id: "tiredness",
    prompt: "How tired do you feel now?",
    choices: ["Not tired", "A bit tired", "Very tired"],
  },
];
