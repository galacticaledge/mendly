"use client";

/**
 * Odd one out — attention and processing speed.
 *
 * A row of shapes, one of which is different. The difference is always shape,
 * never colour, so it does not depend on colour vision, and every option is a
 * full-size target rather than a small icon.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Diamond, Heart, Hexagon, Square, Star, Triangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CognitiveResult, Level } from "@/lib/contracts";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { ScoreKeeper, shuffle } from "./scoring";
import styles from "./games.module.css";

const SHAPES: { icon: LucideIcon; name: string }[] = [
  { icon: Circle, name: "circle" },
  { icon: Square, name: "square" },
  { icon: Triangle, name: "triangle" },
  { icon: Star, name: "star" },
  { icon: Heart, name: "heart" },
  { icon: Diamond, name: "diamond" },
  { icon: Hexagon, name: "hexagon" },
];

type Round = {
  items: { icon: LucideIcon; name: string; odd: boolean }[];
};

function makeRound(size: number): Round {
  const [common, odd] = shuffle(SHAPES).slice(0, 2);
  const items = [
    ...Array.from({ length: size - 1 }, () => ({ ...common, odd: false })),
    { ...odd, odd: true },
  ];
  return { items: shuffle(items) };
}

export type SymbolSortProps = {
  exerciseId: string;
  level: Level;
  rounds: number;
  size: number;
  /** Seconds allowed per round, or 0 for untimed. */
  secondsPerRound: number;
  say: (text: string) => void;
  onFinish: (result: CognitiveResult) => void;
};

export function SymbolSort({
  exerciseId,
  level,
  rounds,
  size,
  secondsPerRound,
  say,
  onFinish,
}: SymbolSortProps) {
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<Round>(() => makeRound(size));
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
    setRound(makeRound(size));
    score.current.beginRound();
  }, [exerciseId, index, level, onFinish, rounds, say, size]);

  const answer = useCallback(
    (odd: boolean) => {
      if (feedback !== null) return;
      score.current.record(odd);
      setFeedback(odd ? "right" : "wrong");
      // A short pause so the person sees whether they were right, which is
      // most of the value of a practice exercise.
      setTimeout(next, 700);
    },
    [feedback, next],
  );

  // A timed round runs out on its own and counts as a miss.
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
        label="Rounds"
        value={index}
        max={rounds}
        valueText={`${index} of ${rounds} done`}
      />

      <p className={`${styles.prompt} body-lg`}>Choose the shape that is different.</p>

      <div className={styles.symbolRow} role="group" aria-label="Choose the different shape">
        {round.items.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              type="button"
              className={styles.symbol}
              onClick={() => answer(item.odd)}
              aria-label={item.name}
            >
              <Icon size={48} strokeWidth={2} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={`${styles.prompt} body-lg`} aria-live="polite">
          {feedback === "right" ? "That's the one." : "That one was different."}
        </p>
      )}
    </div>
  );
}
