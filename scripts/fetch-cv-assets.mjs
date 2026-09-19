/**
 * Put the computer-vision assets under public/ so the app can run offline.
 *
 * Two things are needed in the browser: the MediaPipe wasm runtime, which ships
 * inside the npm package and only needs copying, and the pose model itself,
 * which is a separate download. Both are served from our own origin afterwards.
 *
 * This is worth doing rather than pointing at a CDN: a demo should not depend
 * on conference wifi, and a rehabilitation session should not stall because a
 * third-party host is slow. The app falls back to the CDN if these are missing,
 * so the script is an optimisation, not a build step you can break.
 */

import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  // The package does not export its package.json, so resolve the bundle entry
  // and take its directory as the package root.
  const bundle = require.resolve("@mediapipe/tasks-vision");
  const source = join(dirname(bundle), "wasm");
  const destination = join(root, "public", "mediapipe", "wasm");
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
  console.log("Copied MediaPipe wasm runtime to public/mediapipe/wasm");
}

async function fetchModel() {
  const destination = join(root, "public", "models", "pose_landmarker_lite.task");
  if (await exists(destination)) {
    console.log("Pose model already present; leaving it alone.");
    return;
  }
  await mkdir(dirname(destination), { recursive: true });
  console.log("Downloading the pose model (about 5 MB)...");
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log("Saved public/models/pose_landmarker_lite.task");
}

await copyWasm();
try {
  await fetchModel();
} catch (error) {
  // Not fatal: the app checks for the local file and uses the CDN if it is
  // absent, so a machine with no network can still install and build.
  console.warn(`Could not download the pose model: ${error.message}`);
  console.warn("The app will load it from the CDN instead.");
}
