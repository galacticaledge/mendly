"use client";

/**
 * Drawing the pose on top of the video.
 *
 * This is not decoration. A patient who cannot tell whether the camera can see
 * them has no way to fix a bad setup, and a practitioner watching a demo should
 * be able to see exactly which three landmarks a number came from. So the
 * measured joint is drawn prominently and the rest of the body faintly.
 *
 * Colours are read from the CSS custom properties rather than written here, so
 * the overlay stays inside the design system's palette like everything else.
 */

import type { PoseFrame, PoseLandmarkName } from "@/lib/contracts";
import { isVisible } from "@/lib/cv/landmarks";

/** The skeleton, as pairs of landmarks to join. Drawn faintly for context. */
const SKELETON: [PoseLandmarkName, PoseLandmarkName][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

type Palette = { faint: string; measured: string; lost: string };

/** Read the tokens once per draw call; they are cheap and may change theme. */
function palette(canvas: HTMLCanvasElement): Palette {
  const styles = getComputedStyle(canvas);
  return {
    faint: styles.getPropertyValue("--teal-100").trim() || "#e3eded",
    measured: styles.getPropertyValue("--teal-700").trim() || "#326c6d",
    lost: styles.getPropertyValue("--ink-900").trim() || "#211f1a",
  };
}

export type OverlayOptions = {
  /** The three landmarks the current exercise measures, drawn prominently. */
  measured?: PoseLandmarkName[];
  /** Draws the overlay in ink when tracking is not usable. */
  trackingValid?: boolean;
};

export function drawPose(
  canvas: HTMLCanvasElement,
  frame: PoseFrame,
  options: OverlayOptions = {},
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const colors = palette(canvas);
  const measured = new Set(options.measured ?? []);
  const highlight = options.trackingValid === false ? colors.lost : colors.measured;

  const point = (name: PoseLandmarkName) => {
    const landmark = frame[name];
    if (!isVisible(landmark)) return null;
    return { x: landmark.x * width, y: landmark.y * height };
  };

  // The body, faintly, so the person can see they are framed.
  context.lineWidth = 4;
  context.strokeStyle = colors.faint;
  context.lineCap = "round";
  for (const [from, to] of SKELETON) {
    const a = point(from);
    const b = point(to);
    if (!a || !b) continue;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  // The measured joint, drawn over the top: the two rays that make the angle.
  if (measured.size === 3) {
    const [from, vertex, to] = options.measured as PoseLandmarkName[];
    const a = point(from);
    const b = point(vertex);
    const c = point(to);

    if (a && b && c) {
      context.lineWidth = 8;
      context.strokeStyle = highlight;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.stroke();

      // The vertex is the joint the angle is measured at, so it gets a marker.
      context.fillStyle = highlight;
      context.beginPath();
      context.arc(b.x, b.y, 10, 0, Math.PI * 2);
      context.fill();

      for (const end of [a, c]) {
        context.beginPath();
        context.arc(end.x, end.y, 6, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
}

/** Match the canvas's pixel size to its displayed size, for a crisp overlay. */
export function sizeCanvasToVideo(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width > 0 && canvas.width !== width) canvas.width = width;
  if (height > 0 && canvas.height !== height) canvas.height = height;
}
