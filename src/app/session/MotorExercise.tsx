"use client";

/**
 * A motor exercise, from camera to result.
 *
 * Three things run over the same frame stream, and they are deliberately
 * separate pieces:
 *
 *   ExerciseTracker    measures the joint and counts repetitions
 *   SafetyWatcher      watches posture for a possible fall
 *   EnvironmentChecker confirms the camera can see what is needed, once
 *
 * None of them talk to each other. The tracker does not know about falls, and
 * the watcher keeps running even when the tracker has given up on a repetition.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Video } from "lucide-react";
import type {
  LiveTrackingState,
  MotorExercise as MotorExerciseDef,
  MotorResult,
  PoseFrame,
  Level,
} from "@/lib/contracts";
import { getLevel } from "@/lib/exercises/catalog";
import { ExerciseTracker, requiredLandmarksFor } from "@/lib/cv/exerciseTracker";
import { SafetyWatcher } from "@/lib/cv/safety";
import { EnvironmentChecker, viewForPosture } from "@/lib/cv/environment";
import { usePoseStream } from "@/lib/cv/usePoseStream";
import { drawPose, sizeCanvasToVideo } from "@/lib/cv/overlay";
import { Button } from "@/components/Button/Button";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { useVoiceCommand } from "@/lib/voice/useVoice";
import styles from "./session.module.css";

/** Frames to collect before deciding whether the setup is good enough. */
const SETUP_FRAMES = 45;
/** The safety watcher only needs a few samples a second. */
const SAFETY_INTERVAL_MS = 200;

type Stage = "setup" | "ready" | "running" | "finished";

export type MotorExerciseProps = {
  exercise: MotorExerciseDef;
  level: Level;
  affectedSide: "left" | "right" | "both";
  sessionId: string;
  /** Speaks a line, if the patient has voice prompts on. */
  say: (text: string) => void;
  voiceEnabled: boolean;
  onFinish: (result: MotorResult) => void;
};

export function MotorExercise({
  exercise,
  level,
  affectedSide,
  sessionId,
  say,
  voiceEnabled,
  onFinish,
}: MotorExerciseProps) {
  const rung = getLevel(exercise, level) as { reps: number; targetRomDeg: number; holdSeconds: number };

  const [stage, setStage] = useState<Stage>("setup");
  const [live, setLive] = useState<LiveTrackingState | null>(null);
  const [setupAdvice, setSetupAdvice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Long-lived objects, rebuilt only when the exercise itself changes.
  const trackerRef = useRef<ExerciseTracker | null>(null);
  const watcherRef = useRef(new SafetyWatcher());
  // The setup check verifies the landmarks this exercise measures, not just a
  // generic view: a seated arm exercise passing a head-and-shoulders check with
  // the arm out of frame was exactly how a session could report "camera ready"
  // and then track nothing.
  const checkerRef = useRef(
    new EnvironmentChecker(
      viewForPosture(exercise.posture),
      requiredLandmarksFor(exercise, affectedSide),
    ),
  );
  const lastSafetyAtRef = useRef(0);
  const stageRef = useRef<Stage>("setup");
  const spokenRepRef = useRef(0);
  const finishedRef = useRef(false);

  // Mirrored into a ref for the frame callback, which is called from the
  // animation loop and would otherwise close over a stale stage. Written in an
  // effect rather than during render: a render may be discarded, and the loop
  // reads this long after the render has finished either way.
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  if (trackerRef.current === null) {
    trackerRef.current = new ExerciseTracker({ exercise, level, affectedSide });
  }

  /** Send a safety alert. Fire and forget: it must not block the session. */
  const reportAlert = useCallback(
    (alert: { kind: string; severity: string; message: string; evidence: Record<string, unknown> }) => {
      void fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...alert, sessionId }),
      }).catch(() => {
        // The practitioner will still see the session record; nothing further
        // to do from inside a rehabilitation session.
      });
    },
    [sessionId],
  );

  const finish = useCallback(
    (status: MotorResult["status"]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const tracker = trackerRef.current;
      if (!tracker) return;
      setStage("finished");
      onFinish(tracker.finish(status));
    },
    [onFinish],
  );

  const handleFrame = useCallback(
    (frame: PoseFrame, timestampMs: number) => {
      const tracker = trackerRef.current;
      if (!tracker) return;

      // The safety watcher runs in every stage, including while the person is
      // still setting up. That is when they are moving furniture around.
      if (timestampMs - lastSafetyAtRef.current >= SAFETY_INTERVAL_MS) {
        lastSafetyAtRef.current = timestampMs;
        const alert = watcherRef.current.update(frame, timestampMs);
        if (alert) reportAlert(alert);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        drawPose(canvas, frame, {
          measured: tracker.requiredLandmarks,
          trackingValid: live?.trackingValid ?? true,
        });
      }

      if (stageRef.current === "setup") {
        const checker = checkerRef.current;
        checker.update(frame);
        if (checker.sampleCount >= SETUP_FRAMES) {
          const assessment = checker.result();
          setSetupAdvice(assessment.advice);
          if (assessment.feasible) setStage("ready");
        }
        return;
      }

      if (stageRef.current !== "running") return;

      const state = tracker.update(frame, timestampMs);
      setLive(state);

      // Count out loud, so the person does not have to look at the screen to
      // know it counted. Only movements that actually counted are spoken —
      // saying a number for one that fell short would be a lie told in the
      // most reassuring possible way.
      if (state.validReps > spokenRepRef.current) {
        spokenRepRef.current = state.validReps;
        say(String(state.validReps));
      }

      // `isComplete` also covers running out of attempts without meeting the
      // target. That is still a finished exercise rather than one the patient
      // abandoned, and the record carries valid_reps against target_reps, so
      // the shortfall is visible without overstating what happened.
      if (tracker.isComplete) finish("completed");
    },
    [finish, live?.trackingValid, reportAlert, say],
  );

  const { videoRef, status, error } = usePoseStream({ onFrame: handleFrame, enabled: true });

  // Keep the overlay's pixel grid matched to the video it sits on.
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) sizeCanvasToVideo(canvas, video);
    }, 500);
    return () => clearInterval(interval);
  }, [videoRef]);

  const begin = useCallback(() => {
    if (stageRef.current !== "ready") return;
    setStage("running");
    say(exercise.instruction);
  }, [exercise.instruction, say]);

  // "I'm ready" starts the exercise without anyone reaching for the screen,
  // which is the point: the person is about to use the arm they would reach
  // with. The button beside it does the same thing.
  useVoiceCommand(["i'm ready", "im ready", "i am ready", "ready"], begin, {
    enabled: voiceEnabled && stage === "ready",
  });

  useEffect(() => {
    if (stage === "ready") say("When you are ready, say I'm ready, or press the button.");
  }, [stage, say]);

  // The progress bar counts movements that met the range and the hold. The
  // attempt count is shown separately when the two differ, rather than being
  // mixed into one fraction — showing attempts against a target of valid reps
  // is what let the display read "7 of 5 done".
  const validReps = live?.validReps ?? 0;
  const attempts = live?.reps ?? 0;
  const shortAttempts = Math.max(0, attempts - validReps);
  const setupNeedsFullView = exercise.view === "full";

  return (
    <section className={styles.exercise} aria-labelledby="exercise-title">
      <div className={styles.exerciseHead}>
        <p className="caption">{exercise.posture === "standing" ? "Standing" : "Seated"}</p>
        <h2 id="exercise-title" className="display">
          {exercise.name}
        </h2>
        <p className={`${styles.instruction} body-lg`}>{exercise.instruction}</p>
      </div>

      <div className={styles.stage}>
        {/* Mirrored, so moving the right arm moves the arm on the right of the
            screen. The canvas is inside the same mirrored box, so the overlay
            lines up without flipping the coordinates. */}
        <div className={styles.mirror}>
          <video ref={videoRef} className={styles.video} playsInline muted />
          <canvas ref={canvasRef} className={styles.overlay} aria-hidden="true" />
        </div>

        {status !== "running" && (
          <div className={styles.cameraState}>
            <Video size={24} aria-hidden="true" />
            <p className="body-lg">
              {status === "requesting-camera" && "Asking to use your camera."}
              {status === "loading-model" && "Getting the camera ready."}
              {status === "idle" && "Starting the camera."}
              {(status === "camera-denied" || status === "error") &&
                (error ?? "The camera could not be started.")}
            </p>
          </div>
        )}
      </div>

      {stage === "setup" && status === "running" && (
        <div className={styles.panel}>
          <p className="body-lg">
            {setupNeedsFullView
              ? "Checking the camera can see all of you."
              : "Checking the camera can see you."}
          </p>
          {setupAdvice && (
            <p className={`${styles.advice} body-lg`}>
              <StatusTag tone="caution">Move</StatusTag> {setupAdvice}
            </p>
          )}
        </div>
      )}

      {stage === "ready" && (
        <div className={styles.panel}>
          <StatusTag tone="positive">Camera ready</StatusTag>
          <p className="body-lg">
            You will do this {rung.reps} times
            {rung.holdSeconds > 0 ? `, holding each one for ${rung.holdSeconds} seconds` : ""}.
          </p>
          <Button variant="featured" onClick={begin}>
            I&apos;m ready
          </Button>
        </div>
      )}

      {stage === "running" && (
        <div className={styles.panel}>
          <ProgressBar
            label="Repetitions"
            value={validReps}
            max={rung.reps}
            valueText={`${validReps} of ${rung.reps} done`}
          />

          {shortAttempts > 0 && (
            <p className={`${styles.hint} body`}>
              {shortAttempts === 1
                ? "One movement did not reach far enough to count."
                : `${shortAttempts} movements did not reach far enough to count.`}
            </p>
          )}

          <div className={styles.liveRow}>
            {live?.holdRemaining ? (
              <StatusTag tone="caution">{`Hold ${live.holdRemaining}s`}</StatusTag>
            ) : null}
            {live && !live.trackingValid && <StatusTag tone="caution">Cannot see you</StatusTag>}
            {live?.trackingValid && <StatusTag tone="positive">Tracking</StatusTag>}
          </div>

          {live?.guidance && (
            <p className={`${styles.guidance} body-lg`} aria-live="polite">
              {live.guidance}
            </p>
          )}

          <Button icon={Check} onClick={() => finish("stopped_early")}>
            I&apos;ve had enough of this one
          </Button>
        </div>
      )}
    </section>
  );
}
