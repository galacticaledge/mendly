"use client";

/**
 * Shared scoring for the cognitive games.
 *
 * Every game records the same five things, so a result from Card pairs and a
 * result from Odd one out mean the same thing to the adaptation policy and sit
 * in the same column on a practitioner's screen.
 */

import type { CognitiveResult, Level } from "@/lib/contracts";

export class ScoreKeeper {
  private attempts = 0;
  private correct = 0;
  private reactionTimes: number[] = [];
  private hints = 0;
  private startedAt = performance.now();

  /** Call when a round starts, so the next answer is timed from here. */
  beginRound(): void {
    this.startedAt = performance.now();
  }

  /** Record one answer. The reaction time is measured from `beginRound`. */
  record(correct: boolean): void {
    this.attempts += 1;
    if (correct) this.correct += 1;
    this.reactionTimes.push(performance.now() - this.startedAt);
    this.startedAt = performance.now();
  }

  hintUsed(): void {
    this.hints += 1;
  }

  get accuracy(): number {
    return this.attempts === 0 ? 0 : this.correct / this.attempts;
  }

  result(exerciseId: string, level: Level, status: CognitiveResult["status"]): CognitiveResult {
    const mean =
      this.reactionTimes.length === 0
        ? 0
        : this.reactionTimes.reduce((sum, value) => sum + value, 0) / this.reactionTimes.length;

    return {
      modality: "cognitive",
      exercise_id: exerciseId,
      level,
      status,
      accuracy: Math.round(this.accuracy * 100) / 100,
      avg_reaction_ms: Math.round(mean),
      errors: this.attempts - this.correct,
      attempts: this.attempts,
      hints_used: this.hints,
    };
  }
}

/**
 * A shuffle seeded by nothing in particular — the order should differ every
 * time, or a patient repeating a level would be practising the layout rather
 * than the skill.
 */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
