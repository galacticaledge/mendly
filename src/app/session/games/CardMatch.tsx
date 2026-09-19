"use client";

/**
 * Card pairs — working memory.
 *
 * Turn two cards over and find the pairs. The card faces are words, not
 * pictures or colours: someone with reduced contrast sensitivity should not be
 * asked to tell two similar shades apart, and a word can be read aloud.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CognitiveResult, Level } from "@/lib/contracts";
import { ScoreKeeper, shuffle } from "./scoring";
import styles from "./games.module.css";

const FACES = [
  "Apple", "Bridge", "Candle", "Garden", "Harbour", "Kettle",
  "Ladder", "Meadow", "Pillow", "River", "Saddle", "Window",
];

/** How long a non-matching pair stays face up before turning back. */
const REVEAL_MS = 1200;

type Card = { id: number; face: string; matched: boolean };

export type CardMatchProps = {
  exerciseId: string;
  level: Level;
  /** Number of pairs. */
  pairs: number;
  say: (text: string) => void;
  onFinish: (result: CognitiveResult) => void;
};

export function CardMatch({ exerciseId, level, pairs, say, onFinish }: CardMatchProps) {
  const [cards, setCards] = useState<Card[]>(() =>
    shuffle(FACES.slice(0, pairs).flatMap((face) => [face, face])).map((face, id) => ({
      id,
      face,
      matched: false,
    })),
  );
  const [turned, setTurned] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);

  const score = useRef(new ScoreKeeper());
  const finished = useRef(false);

  const remaining = cards.filter((card) => !card.matched).length;

  useEffect(() => {
    score.current.beginRound();
  }, []);

  const turn = useCallback(
    (id: number) => {
      if (locked) return;
      const card = cards.find((item) => item.id === id);
      if (!card || card.matched || turned.includes(id)) return;

      const next = [...turned, id];
      setTurned(next);
      if (next.length < 2) return;

      const [first, second] = next.map((cardId) => cards.find((item) => item.id === cardId));
      const isMatch = first !== undefined && second !== undefined && first.face === second.face;
      score.current.record(isMatch);

      if (isMatch) {
        setCards((current) =>
          current.map((item) => (next.includes(item.id) ? { ...item, matched: true } : item)),
        );
        setTurned([]);
        score.current.beginRound();
        return;
      }

      // Leave the two showing for a moment so they can be remembered. This is
      // the exercise: turning them back instantly would remove the memory part.
      setLocked(true);
      setTimeout(() => {
        setTurned([]);
        setLocked(false);
        score.current.beginRound();
      }, REVEAL_MS);
    },
    [cards, locked, turned],
  );

  useEffect(() => {
    if (remaining > 0 || finished.current) return;
    finished.current = true;
    say("All the pairs are found.");
    onFinish(score.current.result(exerciseId, level, "completed"));
  }, [remaining, exerciseId, level, onFinish, say]);

  const columns = useMemo(() => (cards.length <= 8 ? 4 : 5), [cards.length]);

  return (
    <div
      className={styles.cardGrid}
      style={{ ["--columns" as string]: String(columns) }}
      role="group"
      aria-label="Card pairs"
    >
      {cards.map((card) => {
        const showing = card.matched || turned.includes(card.id);
        return (
          <button
            key={card.id}
            type="button"
            className={`${styles.card} ${card.matched ? styles.cardMatched : ""} ${showing ? styles.cardUp : ""} body-lg`}
            onClick={() => turn(card.id)}
            disabled={card.matched}
            aria-label={showing ? card.face : "Face down card"}
          >
            {showing ? card.face : ""}
          </button>
        );
      })}
    </div>
  );
}
