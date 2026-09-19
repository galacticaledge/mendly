"use client";

/**
 * Number work — processing speed and working things out.
 *
 * Starts at single-digit addition and grows in both size and operation, which
 * is the progression the clinical source describes: simple sums first, more
 * complex calculations as accuracy and speed improve.
 *
 * Answers are chosen from four options rather than typed. Someone with
 * hemiparesis may not be able to use a keypad, and a typed answer would
 * measure their hand as much as their arithmetic.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CognitiveResult, Level } from "@/lib/contracts";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { ScoreKeeper, shuffle } from "./scoring";
import styles from "./games.module.css";

type Problem = { question: string; answer: number; options: number[] };

/**
 * Build a problem for a difficulty step.
 *
 * 1  single-digit addition          3 + 4
 * 2  two-digit addition             24 + 31
 * 3  addition and subtraction       52 - 17
 * 4  larger, plus small multiplication
 * 5  all three, larger still
 */
function makeProblem(size: number): Problem {
  const pick = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

  let question: string;
  let answer: number;

  if (size <= 1) {
    const a = pick(1, 9);
    const b = pick(1, 9);
    question = `${a} + ${b}`;
    answer = a + b;
  } else if (size === 2) {
    const a = pick(10, 49);
    const b = pick(10, 49);
    question = `${a} + ${b}`;
    answer = a + b;
  } else if (size === 3) {
    const a = pick(20, 99);
    const b = pick(1, a - 1);
    question = `${a} − ${b}`;
    answer = a - b;
  } else if (size === 4) {
    const a = pick(2, 9);
    const b = pick(2, 9);
    question = `${a} × ${b}`;
    answer = a * b;
  } else {
    const a = pick(3, 12);
    const b = pick(3, 12);
    const c = pick(1, 20);
    question = `${a} × ${b} + ${c}`;
    answer = a * b + c;
  }

  // Distractors sit near the answer, so the choice is the arithmetic rather
  // than spotting the only plausible number. They are kept distinct and never
  // negative, which would give the answer away on a subtraction.
  const distractors = new Set<number>();
  let spread = Math.max(2, Math.round(Math.abs(answer) * 0.15));
  while (distractors.size < 3) {
    const delta = pick(1, spread) * (Math.random() < 0.5 ? -1 : 1);
    const candidate = answer + delta;
    if (candidate !== answer && candidate >= 0) distractors.add(candidate);
    // Widen if the band is too tight to hold three distinct neighbours.
    spread += 1;
  }

  return { question, answer, options: shuffle([answer, ...distractors]) };
}

export type MathDrillProps = {
  exerciseId: string;
  level: Level;
  rounds: number;
  /** Difficulty step, 1–5. */
  size: number;
  /** Seconds allowed per problem, or 0 for untimed. */
  secondsPerRound: number;
  say: (text: string) => void;
  onFinish: (result: CognitiveResult) => void;
};

export function MathDrill({
  exerciseId,
  level,
  rounds,
  size,
  secondsPerRound,
  say,
  onFinish,
}: MathDrillProps) {
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<Problem>(() => makeProblem(size));
  const [feedback, setFeedback] = useState<"right" | "wrong" | null>(null);

  const score = useRef(new ScoreKeeper());
  const finished = useRef(false);

  const next = useCallback(() => {
    setFeedback(null);
    if (index + 1 >= rounds) {
      if (finished.current) return;
      finished.current = true;
      say("That is the last one.");
      onFinish(score.current.result(exerciseId, level, "completed"));
      return;
    }
    setIndex((current) => current + 1);
    setProblem(makeProblem(size));
    score.current.beginRound();
  }, [exerciseId, index, level, onFinish, rounds, say, size]);

  const answer = useCallback(
    (choice: number) => {
      if (feedback !== null) return;
      const correct = choice === problem.answer;
      score.current.record(correct);
      setFeedback(correct ? "right" : "wrong");
      // A short pause so the person sees whether they were right, which is
      // most of the value of a practice exercise.
      setTimeout(next, 700);
    },
    [feedback, next, problem.answer],
  );

  // A timed problem runs out on its own and counts as a miss.
  useEffect(() => {
    if (secondsPerRound <= 0) return;
    const timer = setTimeout(() => {
      if (feedback !== null) return;
      score.current.record(false);
      setFeedback("wrong");
      setTimeout(next, 700);
    }, secondsPerRound * 1000);
    return () => clearTimeout(timer);
  }, [index, secondsPerRound, feedback, next]);

  useEffect(() => {
    score.current.beginRound();
  }, []);

  return (
    <div className={styles.game}>
      <ProgressBar
        label="Sums"
        value={index}
        max={rounds}
        valueText={`${index} of ${rounds} done`}
      />

      <p className={`${styles.sum} display`} aria-live="polite">
        {problem.question}
      </p>

      <div className={styles.symbolRow} role="group" aria-label="Choose the answer">
        {problem.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.answer} h2`}
            onClick={() => answer(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {feedback && (
        <p className={`${styles.prompt} body-lg`} aria-live="polite">
          {feedback === "right" ? "That's right." : `The answer was ${problem.answer}.`}
        </p>
      )}
    </div>
  );
}
