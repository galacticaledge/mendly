# Rules for Codex / Claude Code

## Rule 1 — Inspect Before Editing

Always inspect the current repository and branch before generating a new implementation.

Do not assume a file, component, hook, service, or API already exists.

## Rule 2 — Do Not Rewrite the Architecture

The hackathon has just started.

Prefer small additions to the team's current codebase over large restructures.

## Rule 3 — Preserve Ownership Boundaries

CV code belongs to the CV layer.

Do not move backend, authentication, database, dashboard, or practitioner logic into the CV module merely to make one feature easier.

## Rule 4 — Explainable Code

HopHacks allows AI tools, but participants must be able to explain the code in the repository.

Generated code must therefore be understandable, testable, and reviewable.

When generating non-trivial CV logic, explain:

- what the landmarks represent
- why the selected landmarks are used
- how the angle is calculated
- how smoothing works
- how the state machine works
- how invalid tracking is handled
- what the metric means

## Rule 5 — No Silent Medical Claims

Do not add comments, UI copy, or code identifiers implying clinical certainty.

Use terms such as:

- observed metric
- movement signal
- tracking confidence
- feasibility signal
- possible safety anomaly

rather than unsupported medical diagnoses.

## Rule 6 — Do Not Overbuild

For each feature, prefer:

1. smallest implementation
2. test it
3. integrate it
4. only then generalize

## Rule 7 — Never Hide CV Failures

When tracking becomes unreliable, expose that state.

Do not continue producing confident-looking metrics from invalid landmarks.

## Rule 8 — Keep AI Away From Raw Frame Loops

The normal architecture is:

`frames → CV → validated metrics → backend/AI`

Do not call an LLM for every frame or every small coordinate update.

## Rule 9 — Match Shared Contracts

Before changing the shape of a CV result, inspect the current team types/API.

Do not invent a second incompatible schema.

## Rule 10 — Make Small Commits

Keep changes logically separated when practical:

- pose setup
- metrics
- validation
- integration
- optional features

This makes review and debugging easier.
