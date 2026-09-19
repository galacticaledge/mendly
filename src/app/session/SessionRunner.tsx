"use client";

/**
 * The session, from start to finish.
 *
 * It walks the approved set in order, hands each exercise to the right view,
 * sends each result to the server, and shows what the adaptation policy decided
 * before moving on. Then it asks the closing questions and finishes.
 *
 * Two things are worth pointing out. The patient is told when a level changes
 * and why, because a session that silently gets harder is unsettling. And every
 * step can be reached with the keyboard and driven by voice, because the person
 * doing this has just been asked to use their affected arm.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import type {
  UiProfile,
  CognitiveExercise,
  CognitiveResult,
  ExerciseResult,
  Level,
  MotorExercise as MotorExerciseDef,
  MotorResult,
  SessionAnswer,
} from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";
import { getLevel } from "@/lib/exercises/catalog";
import type { Adaptation } from "@/lib/ai/adapt";
import { Button } from "@/components/Button/Button";
import { Choice } from "@/components/Choice/Choice";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { useSpeech, useVoiceCommand, useVoiceSpeed } from "@/lib/voice/useVoice";
import { VoiceCue } from "./VoiceCue";
import { MotorExercise } from "./MotorExercise";
import { CardMatch } from "./games/CardMatch";
import { SymbolSort } from "./games/SymbolSort";
import { WordRecall } from "./games/WordRecall";
import { MathDrill } from "./games/MathDrill";
import styles from "./session.module.css";

type PlanItem = {
  exercise: MotorExerciseDef | CognitiveExercise;
  level: Level;
  rationale: string;
  minutes: number;
};

type Question = { id: string; prompt: string; choices: string[] };

type Stage = "intro" | "exercise" | "between" | "questions" | "done";

export type SessionRunnerProps = {
  sessionId: string;
  plan: PlanItem[];
  /** Exercise ids already recorded, for a session being resumed. */
  completedExerciseIds: string[];
  affectedSide: "left" | "right" | "both";
  firstName: string;
  practitionerNotes: string;
  questions: Question[];
  /** The account's interface profile. Aphasia-friendly shortens the copy. */
  uiProfile: UiProfile;
};

export function SessionRunner({
  sessionId,
  plan,
  completedExerciseIds,
  affectedSide,
  firstName,
  practitionerNotes,
  questions,
  uiProfile,
}: SessionRunnerProps) {
  const aphasia = uiProfile === "aphasia";
  const remaining = useMemo(
    () => plan.filter((item) => !completedExerciseIds.includes(item.exercise.id)),
    [plan, completedExerciseIds],
  );

  const [stage, setStage] = useState<Stage>("intro");
  const [index, setIndex] = useState(0);
  const [adaptation, setAdaptation] = useState<Adaptation | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const { speak, cancel, speaking, enabled: voiceEnabled, setEnabled } = useSpeech();
  const { speed, slower, faster, atSlowest, atFastest } = useVoiceSpeed();
  const submittedRef = useRef(false);

  const say = useCallback((text: string) => void speak(text), [speak]);

  /**
   * One step slower or faster, and say so.
   *
   * The confirmation only goes into a silence. Cutting off the prompt someone
   * is listening to in order to announce that it changed speed would take away
   * the very thing they were adjusting — and on the recorded voice the change
   * is already audible mid-sentence, so there is nothing to announce there.
   */
  const adjustSpeed = useCallback(
    (direction: -1 | 1) => {
      if (direction < 0) slower();
      else faster();
      if (!speaking) say(direction < 0 ? "Speaking slower." : "Speaking faster.");
    },
    [faster, say, slower, speaking],
  );

  const current = remaining[index];
  const done = plan.length - remaining.length + index;

  /* ---------------- Intro ---------------- */

  const begin = useCallback(() => {
    if (stage !== "intro") return;
    setStage("exercise");
  }, [stage]);

  // Listening is not tied to the speaking toggle. That toggle turns the spoken
  // prompts off, which someone may want in a quiet room; it is not a reason to
  // take away the way they drive the session.
  const introVoice = useVoiceCommand(["im ready", "i am ready", "lets start", "start now"], begin, {
    enabled: stage === "intro",
  });

  useEffect(() => {
    if (stage !== "intro") return;
    const notes = practitionerNotes ? ` Your care team says: ${practitionerNotes}` : "";
    say(
      `Hello ${firstName}. You have ${remaining.length} ${remaining.length === 1 ? "exercise" : "exercises"} today.${notes} When you are ready, say I'm ready.`,
    );
  }, [stage, firstName, remaining.length, practitionerNotes, say]);

  /* ---------------- One exercise finishing ---------------- */

  const submitResult = useCallback(
    async (result: ExerciseResult) => {
      cancel();
      setStage("between");

      try {
        const response = await fetch(`/api/session/${sessionId}/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        });
        const body = await response.json();
        if (response.ok && body.adaptation) {
          setAdaptation(body.adaptation as Adaptation);
          say(body.adaptation.reason);
        }
      } catch {
        // The exercise was still done. Saying so is better than an error the
        // person can do nothing about mid-session.
        setAdaptation(null);
      }
    },
    [cancel, sessionId, say],
  );

  const next = useCallback(() => {
    setAdaptation(null);
    if (index + 1 >= remaining.length) {
      setStage("questions");
      return;
    }
    setIndex((value) => value + 1);
    setStage("exercise");
  }, [index, remaining.length]);

  const betweenVoice = useVoiceCommand(["next", "carry on", "keep going", "continue"], next, {
    enabled: stage === "between",
  });

  // Only where something else already has the microphone open. Speed control
  // is not worth holding the microphone open for a whole session to provide,
  // and these are the two points where the app does most of its talking, so
  // they are where someone notices the pace and reaches to change it.
  const speedByVoice = voiceEnabled && (stage === "intro" || stage === "between");
  useVoiceCommand(["slow down", "slower"], () => adjustSpeed(-1), { enabled: speedByVoice });
  useVoiceCommand(["speed up", "faster"], () => adjustSpeed(1), { enabled: speedByVoice });

  /* ---------------- Finishing ---------------- */

  const finishSession = useCallback(
    async (abandoned: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSaving(true);
      setFinishError(null);

      const payload: { answers: SessionAnswer[]; abandoned: boolean } = {
        answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        abandoned,
      };

      try {
        const response = await fetch(`/api/session/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("The session could not be saved.");
        setStage("done");
        say("That is your session finished. Well done.");
      } catch {
        submittedRef.current = false;
        setFinishError("Your session could not be saved. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    },
    [answers, sessionId, say],
  );

  /* ---------------- Render ---------------- */

  const voiceToggle = (
    <button
      type="button"
      className={`${styles.voiceToggle} label`}
      onClick={() => {
        if (voiceEnabled) cancel();
        setEnabled(!voiceEnabled);
      }}
      aria-pressed={voiceEnabled}
    >
      {voiceEnabled ? <Volume2 size={24} aria-hidden="true" /> : <VolumeX size={24} aria-hidden="true" />}
      {voiceEnabled ? "Speaking on" : "Speaking off"}
    </button>
  );

  // Hidden rather than disabled when speaking is off: there is no pace to set,
  // and a dead control with no explanation beside it is worse than no control.
  const speedControl = voiceEnabled ? (
    <div className={styles.speed} role="group" aria-label="How fast the voice speaks">
      <button
        type="button"
        className={styles.speedStep}
        onClick={() => adjustSpeed(-1)}
        disabled={atSlowest}
        aria-label="Speak slower"
      >
        <Minus size={24} aria-hidden="true" />
      </button>
      <span className={`${styles.speedValue} label`} aria-live="polite">
        {speed}&#215;
      </span>
      <button
        type="button"
        className={styles.speedStep}
        onClick={() => adjustSpeed(1)}
        disabled={atFastest}
        aria-label="Speak faster"
      >
        <Plus size={24} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  if (remaining.length === 0 && stage !== "done") {
    return (
      <main className={styles.main}>
        <h1 className="display">You have already finished today&apos;s exercises</h1>
        <Button variant="featured" onClick={() => finishSession(false)}>
          Finish and answer a few questions
        </Button>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.topline}>
        <ProgressBar
          label="Session"
          value={done}
          max={plan.length}
          valueText={`${done} of ${plan.length} done`}
        />
        <div className={styles.voiceControls}>
          {speedControl}
          {voiceToggle}
        </div>
      </div>

      {stage === "intro" && (
        <section className={styles.panelWide}>
          <h1 className="display">Ready when you are, {firstName}</h1>
          <p className="body-lg">
            {aphasia
              ? `${remaining.length} ${remaining.length === 1 ? "exercise" : "exercises"}. Stop any time.`
              : `${
                  remaining.length === 1
                    ? "There is one exercise today."
                    : `There are ${remaining.length} exercises today.`
                } You can stop at any point, and nothing is lost if you do.`}
          </p>
          {practitionerNotes && (
            <p className={`${styles.notes} body-lg`}>
              <span className="caption">From your care team</span>
              {practitionerNotes}
            </p>
          )}
          <VoiceCue status={introVoice.status} phrase="I'm ready" />
          <Button variant="featured" icon={ArrowRight} onClick={begin}>
            I&apos;m ready
          </Button>
        </section>
      )}

      {stage === "exercise" && current && (
        isMotor(current.exercise) ? (
          <MotorExercise
            key={current.exercise.id}
            exercise={current.exercise}
            level={current.level}
            affectedSide={affectedSide}
            sessionId={sessionId}
            say={say}
            onFinish={(result: MotorResult) => void submitResult(result)}
          />
        ) : (
          <section className={styles.exercise}>
            <div className={styles.exerciseHead}>
              <p className="caption">{current.exercise.focus}</p>
              <h1 className="display">{current.exercise.name}</h1>
              <p className={`${styles.instruction} body-lg`}>{current.exercise.instruction}</p>
            </div>
            <CognitiveGame
              key={current.exercise.id}
              exercise={current.exercise}
              level={current.level}
              say={say}
              onFinish={(result: CognitiveResult) => void submitResult(result)}
            />
          </section>
        )
      )}

      {stage === "between" && (
        <section className={styles.panelWide} aria-live="polite">
          <StatusTag tone="positive">Done</StatusTag>
          <h1 className="display">That one is finished</h1>
          {adaptation && (
            <p className="body-lg">
              {adaptation.reason}
              {adaptation.direction !== "hold" && (
                <>
                  {" "}
                  Next time it will be at level {adaptation.toLevel}.
                </>
              )}
            </p>
          )}
          <VoiceCue status={betweenVoice.status} phrase="next" />
          <Button variant="featured" icon={ArrowRight} onClick={next}>
            {index + 1 >= remaining.length ? "Finish up" : "Next exercise"}
          </Button>
        </section>
      )}

      {stage === "questions" && (
        <section className={styles.panelWide}>
          <h1 className="display">A few questions</h1>
          <p className="body-lg">
            {aphasia ? "For your care team. No wrong answers." : "These go to your care team. There are no wrong answers."}
          </p>
          <div className={styles.questions}>
            {questions.map((question) => (
              <Choice
                key={question.id}
                label={question.prompt}
                options={question.choices}
                value={answers[question.id] ?? null}
                onChange={(value) =>
                  setAnswers((current) => ({ ...current, [question.id]: value }))
                }
                compact
              />
            ))}
          </div>
          {finishError && (
            <p className={`${styles.error} body`} role="alert">
              {finishError}
            </p>
          )}
          <Button variant="featured" onClick={() => finishSession(false)} disabled={saving}>
            {saving ? "Saving" : "Finish session"}
          </Button>
        </section>
      )}

      {stage === "done" && (
        <section className={styles.panelWide}>
          <StatusTag tone="positive">Session complete</StatusTag>
          <h1 className="display">That is today done</h1>
          <p className="body-lg">
            {aphasia
              ? "Your care team will see it."
              : "Your care team can see how it went. They will look at what comes next."}
          </p>
          <Link href="/" className={`${styles.homeLink} label`}>
            Back to today
          </Link>
        </section>
      )}
    </main>
  );
}

/** Picks the game that renders a cognitive exercise. */
function CognitiveGame({
  exercise,
  level,
  say,
  onFinish,
}: {
  exercise: CognitiveExercise;
  level: Level;
  say: (text: string) => void;
  onFinish: (result: CognitiveResult) => void;
}) {
  const rung = getLevel(exercise, level) as {
    rounds: number;
    size: number;
    secondsPerRound: number;
  };

  switch (exercise.game) {
    case "card-match":
      return (
        <CardMatch
          key={exercise.id}
          exerciseId={exercise.id}
          level={level}
          pairs={rung.size}
          say={say}
          onFinish={onFinish}
        />
      );
    case "symbol-sort":
      return (
        <SymbolSort
          key={exercise.id}
          exerciseId={exercise.id}
          level={level}
          rounds={rung.rounds}
          size={rung.size}
          secondsPerRound={rung.secondsPerRound}
          say={say}
          onFinish={onFinish}
        />
      );
    case "word-recall":
      return (
        <WordRecall
          key={exercise.id}
          exerciseId={exercise.id}
          level={level}
          rounds={rung.rounds}
          size={rung.size}
          say={say}
          onFinish={onFinish}
        />
      );
    case "math-drill":
      return (
        <MathDrill
          key={exercise.id}
          exerciseId={exercise.id}
          level={level}
          rounds={rung.rounds}
          size={rung.size}
          secondsPerRound={rung.secondsPerRound}
          say={say}
          onFinish={onFinish}
        />
      );
  }
}
