"use client";

/**
 * Camera in, named landmarks out.
 *
 * Everything browser-specific lives here: asking for the webcam, loading the
 * MediaPipe runtime, and running the frame loop. The rest of the CV layer is
 * plain functions and classes over `PoseFrame`, which is why it can be read and
 * reasoned about without a camera attached.
 *
 * The loop is driven by requestAnimationFrame and hands each frame to the
 * caller's `onFrame`. That callback is kept in a ref rather than in the effect
 * dependencies, so a parent re-rendering every frame — which it will, since it
 * is showing live values — does not tear down and rebuild the camera.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { PoseFrame } from "@/lib/contracts";
import { toPoseFrame } from "@/lib/cv/landmarks";

export type PoseStreamStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "running"
  | "camera-denied"
  | "error";

export type PoseStreamOptions = {
  /** Called for every processed frame, with landmarks and a timestamp in ms. */
  onFrame: (frame: PoseFrame, timestampMs: number, raw: NormalizedLandmark[]) => void;
  /** Nothing starts until this is true, so a page can mount before the camera. */
  enabled: boolean;
};

/** Where the wasm runtime lives when it has been copied into public/. */
const LOCAL_WASM = "/mediapipe/wasm";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const LOCAL_MODEL = "/models/pose_landmarker_lite.task";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/** Prefer our own copy; fall back to the CDN if it was never fetched. */
async function resolveAsset(local: string, cdn: string): Promise<string> {
  try {
    const response = await fetch(local, { method: "HEAD" });
    if (response.ok) return local;
  } catch {
    // Offline and no local copy: the CDN attempt below will report the failure.
  }
  return cdn;
}

export function usePoseStream({ onFrame, enabled }: PoseStreamOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PoseStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Held in a ref because the frame loop must not restart when the callback
  // changes — the parent re-renders on every frame, since it is showing live
  // values, and rebuilding the camera each time would make it unusable.
  // Assigned in an effect rather than during render: the loop reads it
  // asynchronously, well after any render has committed.
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  /** MediaPipe rejects a timestamp that is not greater than the last one. */
  const lastTimestampRef = useRef(-1);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    lastTimestampRef.current = -1;
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      try {
        setError(null);
        setStatus("requesting-camera");

        const stream = await navigator.mediaDevices.getUserMedia({
          // 640x480 is plenty for pose landmarks and keeps the per-frame cost
          // low enough to hold 30fps on a laptop without a discrete GPU.
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error("The camera view is not on the page yet.");
        video.srcObject = stream;
        await video.play();

        setStatus("loading-model");

        // Imported here rather than at module scope: the bundle is large and
        // touches browser globals, so it must not be pulled into a server render.
        const { FilesetResolver, PoseLandmarker: Landmarker } = await import(
          "@mediapipe/tasks-vision"
        );

        const [wasmPath, modelPath] = await Promise.all([
          resolveAsset(`${LOCAL_WASM}/vision_wasm_internal.js`, CDN_WASM).then((resolved) =>
            resolved === CDN_WASM ? CDN_WASM : LOCAL_WASM,
          ),
          resolveAsset(LOCAL_MODEL, CDN_MODEL),
        ]);

        const vision = await FilesetResolver.forVisionTasks(wasmPath);
        const landmarker = await Landmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
          // MediaPipe's own gates. Ours are stricter and live in the CV layer;
          // these only decide what it bothers to report at all.
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setStatus("running");

        const tick = () => {
          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;

          if (!currentVideo || !currentLandmarker || currentVideo.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          // Skip a repeated frame rather than feeding the same timestamp twice.
          const timestamp = performance.now();
          if (timestamp <= lastTimestampRef.current) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          lastTimestampRef.current = timestamp;

          try {
            const result = currentLandmarker.detectForVideo(currentVideo, timestamp);
            const raw = result.landmarks?.[0] ?? [];
            onFrameRef.current(toPoseFrame(raw), timestamp, raw);
          } catch {
            // A dropped frame is not worth ending a session over; the tracker
            // treats the gap as lost tracking, which is the honest reading.
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        const denied =
          caught instanceof DOMException &&
          (caught.name === "NotAllowedError" || caught.name === "PermissionDeniedError");
        setError(
          denied
            ? "Mendly needs the camera to watch your movement. You can turn it on in your browser settings."
            : message,
        );
        setStatus(denied ? "camera-denied" : "error");
      }
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, stop]);

  return { videoRef, status, error, stop };
}
