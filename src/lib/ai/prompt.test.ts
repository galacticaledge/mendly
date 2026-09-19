/**
 * Parsing a model's reply.
 *
 * Backboard's `json_output` guarantees valid JSON but not a particular shape,
 * so unlike a provider with real schema enforcement, this parser is the only
 * thing standing between a model's reply and the guardrails. These cover what
 * a model actually does wrong: fencing the JSON, adding a sentence in front of
 * it, omitting a field, or returning something that is not a proposal at all.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseProposal } from "@/lib/ai/prompt";

const GOOD = JSON.stringify({
  summary: "Three exercises, holding the arm raise steady.",
  exercises: [
    { exerciseId: "arm_raise", level: 2, rationale: "Met the target last time." },
    { exerciseId: "card_match", level: 1, rationale: "New to this one." },
  ],
});

test("a clean JSON reply parses", () => {
  const result = parseProposal(GOOD, "backboard");
  assert.ok(result);
  assert.equal(result.source, "backboard");
  assert.equal(result.exercises.length, 2);
  assert.equal(result.exercises[0].exerciseId, "arm_raise");
  assert.equal(result.exercises[0].level, 2);
});

test("a fenced reply parses", () => {
  const result = parseProposal("```json\n" + GOOD + "\n```", "backboard");
  assert.ok(result, "a ```json fence should not cost us the proposal");
  assert.equal(result.exercises.length, 2);
});

test("a reply with a sentence in front of it parses", () => {
  const result = parseProposal(`Here is the set I suggest:\n\n${GOOD}`, "backboard");
  assert.ok(result);
  assert.equal(result.exercises.length, 2);
});

test("a missing rationale does not lose the exercise", () => {
  const result = parseProposal(
    JSON.stringify({ summary: "", exercises: [{ exerciseId: "arm_raise", level: 3 }] }),
    "backboard",
  );
  assert.ok(result);
  assert.equal(result.exercises[0].rationale, "No reason given.");
});

test("a missing level defaults to the gentlest, not to nothing", () => {
  const result = parseProposal(
    JSON.stringify({ exercises: [{ exerciseId: "arm_raise", rationale: "x" }] }),
    "backboard",
  );
  assert.ok(result);
  assert.equal(result.exercises[0].level, 1);
});

test("an exercise with no id is dropped, keeping the rest", () => {
  const result = parseProposal(
    JSON.stringify({
      exercises: [{ level: 2, rationale: "no id" }, { exerciseId: "card_match", level: 1 }],
    }),
    "backboard",
  );
  assert.ok(result);
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].exerciseId, "card_match");
});

test("unusable replies return null so the caller can fall back", () => {
  // Each of these is something a model has plausibly returned instead of a
  // proposal. None may produce a half-built set — the rules engine takes over.
  assert.equal(parseProposal(null, "backboard"), null);
  assert.equal(parseProposal("", "backboard"), null);
  assert.equal(parseProposal("I cannot help with that.", "backboard"), null);
  assert.equal(parseProposal("{ not valid json", "backboard"), null);
  assert.equal(parseProposal(JSON.stringify({ summary: "hi" }), "backboard"), null);
  assert.equal(parseProposal(JSON.stringify({ exercises: [] }), "backboard"), null);
  assert.equal(parseProposal(JSON.stringify({ exercises: "arm_raise" }), "backboard"), null);
});

test("the parser does not decide what is allowed", () => {
  // An id that is not in the catalog survives parsing on purpose. Dropping it
  // here would hide from the practitioner that the model tried to propose it;
  // the guardrails remove it and report the violation.
  const result = parseProposal(
    JSON.stringify({ exercises: [{ exerciseId: "moon_walk", level: 9, rationale: "" }] }),
    "backboard",
  );
  assert.ok(result);
  assert.equal(result.exercises[0].exerciseId, "moon_walk");
});
