# 36-Hour Implementation Plan — Quoc

## Phase 0 — Repository Reconnaissance

Before coding:

- inspect the existing branch `An/flow`
- identify frontend framework and camera code
- identify where shared types/contracts live
- identify current exercise/session structures
- avoid creating a parallel architecture unnecessarily

Deliverable:

A clear place in the existing repository for CV code.

## Phase 1 — Camera + Pose

Build:

`webcam → MediaPipe Pose → visible landmarks`

Verify that the pipeline works in the actual project.

Do not start with AI.

## Phase 2 — One Exercise

Implement one exercise end-to-end:

- landmark selection
- joint angle
- smoothing
- state machine
- repetition counting
- basic ROM
- confidence/tracking validation

Deliverable:

A reliable local demo of one exercise.

## Phase 3 — Structured Metrics

Convert the exercise result into the shared team format.

Deliverable:

A clean object that the backend/AI layer can consume.

## Phase 4 — AI Integration

Connect the validated exercise result to the team's adaptation flow.

Demonstrate:

```text
patient performs
→ metrics change
→ AI receives metrics
→ next exercise/difficulty changes
```

Stay within practitioner-approved exercise rules.

## Phase 5 — Second Exercise or Hand Tracking

Only after the first exercise is reliable:

- add a second Pose exercise, or
- add one Hand Landmarker exercise if the product clearly needs fine-motor rehab.

Prefer depth over breadth.

## Phase 6 — Environment / Safety

Only if the core demo is stable and there is enough time:

- environment feasibility
- mode transition support
- safety anomaly prototype

## Definition of Done

Your primary work is done when:

1. one motor exercise works from webcam to validated metrics;
2. tracking loss does not produce obviously fake reps;
3. structured metrics reach the team integration layer;
4. the AI adaptation flow can react to those metrics;
5. the code is understandable enough to explain during judging.
