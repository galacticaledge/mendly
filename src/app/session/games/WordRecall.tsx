"use client";

/**
 * Word list — language and memory.
 *
 * Read a short list, then pick out the words that were on it. Words are
 * everyday and concrete, and every one is spoken as well as written: for
 * someone with aphasia, hearing a word and reading it are different tasks, and
 * this exercise should not quietly become a reading test.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CognitiveResult, Level } from "@/lib/contracts";
import { Button } from "@/components/Button/Button";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { ScoreKeeper, shuffle } from "./scoring";
import styles from "./games.module.css";

const WORDS = [
  "bread", "chair", "clock", "flower", "garden", "hat", "key", "lamp",
  "letter", "mirror", "orange", "pencil", "rain", "shoe", "spoon", "table",
  "train", "window", "basket", "candle", "river", "button", "kettle", "ladder",
];

/** Seconds the list is shown before the choices appear. */
const STUDY_SECONDS = 6;

type Phase = "study" | "choose" | "between";

type Round = { words: string[]; options: string[] };

/**
 * A list to remember, plus the choices it will be hidden among.
 *
 * Twice as many options as words, so guessing everything is worth about half a
 * mark rather than most of one.
 */
function makeRound(size: number): Round {
  const pool = shuffle(WORDS);
  const words = pool.slice(0, size);
  const decoys = pool.slice(size, size * 2);
  return { words, options: shuffle([...words, ...decoys]) };
}

export type WordRecallProps = {
  exerciseId: string;
  level: Level;
  rounds: number;
  /** Words in the list to remember. */
  size: number;
  say: (text: string) => void;
  onFinish: (result: CognitiveResult) => void;
};

export function WordRecall({ exerciseId, level, rounds, size, say, onFinish }: WordRecallProps) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("study");
  // The first round is built once, as the initial state. Later rounds are
  // built when the person presses for one, so no round is ever generated
  // during a render that React might discard.
  const [round, setRound] = useState<Round>(() => makeRound(size));
  const [picked, setPicked] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(STUDY_SECONDS);

  const score = useRef(new ScoreKeeper());
  const finished = useRef(false);

  const target = round.words;
  const options = round.options;

  const startRound = useCallback(() => {
    const next = makeRound(size);
    setRound(next);
    setPicked([]);
    setCountdown(STUDY_SECONDS);
    setPhase("study");
    say(`Remember these words. ${next.words.join(". ")}.`);
  }, [say, size]);

  // Read the first list aloud. No state changes here: the list already exists.
  useEffect(() => {
    say(`Remember these words. ${target.join(". ")}.`);
    // Only for the list that was built as the initial state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The study phase runs on two timers, and both change state from a callback
  // rather than from the effect body: one ticks the countdown the person reads,
  // the other ends the phase when the time is up.
  useEffect(() => {
    if (phase !== "study") return;

    const tick = setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);

    const done = setTimeout(() => {
      setPhase("choose");
      score.current.beginRound();
      say("Now choose the words you saw.");
    }, STUDY_SECONDS * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [phase, say]);

  const toggle = (word: string) => {
    setPicked((current) =>
      current.includes(word) ? current.filter((item) => item !== word) : [...current, word],
    );
  };

  const submit = () => {
    // Each word on the original list is one attempt, scored on whether it was
    // picked. Picking a decoy is scored as its own wrong attempt, so guessing
    // everything does not produce a perfect score.
    for (const word of target) score.current.record(picked.includes(word));
    for (const word of picked) {
      if (!target.includes(word)) score.current.record(false);
    }

    if (roundIndex + 1 >= rounds) {
      if (finished.current) return;
      finished.current = true;
      say("That was the last list.");
      onFinish(score.current.result(exerciseId, level, "completed"));
      return;
    }

    setPhase("between");
    setRoundIndex((current) => current + 1);
  };

  if (phase === "between") {
    return (
      <div className={styles.game}>
        <ProgressBar
          label="Lists"
          value={roundIndex}
          max={rounds}
          valueText={`${roundIndex} of ${rounds} done`}
        />
        <p className={`${styles.prompt} body-lg`}>Ready for the next list?</p>
        <Button variant="featured" onClick={startRound}>
          Next list
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.game}>
      <ProgressBar
        label="Lists"
        value={roundIndex}
        max={rounds}
        valueText={`${roundIndex} of ${rounds} done`}
      />

      {phase === "study" ? (
        <>
          <p className={`${styles.prompt} body-lg`} aria-live="polite">
            Remember these words. {countdown} seconds left.
          </p>
          <ul className={styles.wordList}>
            {target.map((word) => (
              <li key={word} className={`${styles.word} h2`}>
                {word}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className={`${styles.prompt} body-lg`}>Choose the words you saw.</p>
          <div className={styles.wordChoices} role="group" aria-label="Words">
            {options.map((word) => {
              const selected = picked.includes(word);
              return (
                <button
                  key={word}
                  type="button"
                  className={`${styles.wordChoice} ${selected ? styles.wordChosen : ""} body-lg`}
                  aria-pressed={selected}
                  onClick={() => toggle(word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <Button variant="featured" onClick={submit}>
            Done choosing
          </Button>
        </>
      )}
    </div>
  );
}
