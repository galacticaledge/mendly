/**
 * The service log's one job is restraint.
 *
 * It exists because a session speaks a prompt every few seconds: a line per
 * call would bury the one line that matters. So the thing worth testing is not
 * that it can print, but that it stays quiet while nothing changes and speaks
 * the moment something does — including when a service recovers, which is the
 * case a "log it once and never again" approach gets wrong.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { serviceLog } from "@/lib/serviceLog";

/** Runs `body` with console.log and console.warn captured. */
function capture(body: () => void): string[] {
  const lines: string[] = [];
  const { log, warn } = console;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  console.warn = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    body();
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return lines;
}

test("a working key says so once, not once per call", () => {
  const lines = capture(() => {
    const report = serviceLog("ElevenLabs");
    report("working", "voice abc");
    report("working", "voice abc");
    report("working", "voice abc");
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /ElevenLabs/);
  assert.match(lines[0], /API key works/);
  assert.match(lines[0], /voice abc/);
});

test("a missing key is reported, and is not an error", () => {
  const warnings: string[] = [];
  const { warn } = console;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  const lines = capture(() => {
    const report = serviceLog("Backboard");
    report("absent", "the rules engine will draft every set");
    report("absent");
  });
  console.warn = warn;

  assert.equal(lines.length, 1, "a supported way to run is stated once");
  assert.match(lines[0], /no API key set/);
  assert.equal(warnings.length, 0, "running without a key is not a warning");
});

test("a key that stops working, and starts again, is reported both times", () => {
  const lines = capture(() => {
    const report = serviceLog("Backboard");
    report("working", "gemini-2.5-flash");
    report("failing", "HTTP 401");
    report("failing", "HTTP 401");
    report("working", "gemini-2.5-flash");
  });

  assert.equal(lines.length, 3);
  assert.match(lines[0], /API key works/);
  assert.match(lines[1], /the call failed/);
  assert.match(lines[2], /API key works/, "recovery is news too");
});

test("each service is tracked on its own", () => {
  const lines = capture(() => {
    const voice = serviceLog("ElevenLabs");
    const planner = serviceLog("Backboard");
    voice("working");
    planner("working");
  });

  assert.equal(lines.length, 2, "one service reporting does not silence another");
});

test("it says whether it reported, so a caller can gate its own diagnostic", () => {
  const seen: boolean[] = [];
  capture(() => {
    const report = serviceLog("ElevenLabs");
    seen.push(report("failing", "HTTP 401"));
    seen.push(report("failing", "HTTP 401"));
    seen.push(report("working"));
  });

  assert.deepEqual(seen, [true, false, true]);
});

test("the detail is optional and never invents an empty one", () => {
  const lines = capture(() => serviceLog("Backboard")("working"));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[mendly] Backboard: API key works");
});
