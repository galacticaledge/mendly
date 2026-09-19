# Pose Metrics

## MediaPipe Pose

The expected starting point is browser-side MediaPipe Pose Landmarker.

The exact package/version and project structure must be determined from the current repository rather than assumed.

## Landmark Model

The CV code receives body landmarks with coordinate information and confidence-related information.

The implementation should account for:

- x/y position
- z when useful
- visibility / confidence when available
- temporal consistency

Do not treat a single noisy frame as a complete exercise result.

## Joint Angle

For a joint such as the elbow, use three landmarks:

`shoulder → elbow → wrist`

The angle is derived from the two vectors around the joint.

Conceptually:

```text
A ---- B ---- C
      joint
```

The exact implementation can use vector math and an arccos-based angle calculation.

The important requirement is that the implementation is understandable and testable, not that the formula is memorized.

## ROM

ROM should represent movement across a defined exercise cycle.

Example concept:

```text
start angle → minimum/maximum angle reached → return
```

For an exercise, define:

- target joint
- expected movement direction
- valid angle range
- how the cycle starts
- how the cycle ends

Do not use arbitrary thresholds without documenting why they are needed for the selected demo exercise.

## Repetition Counting

A repetition should be modeled as a state transition rather than simply counting threshold crossings.

Example:

```text
OPEN
  ↓
CLOSED
  ↓
OPEN
  ↓
1 valid repetition
```

The exact state names depend on the exercise.

## Per-Rep Metrics

A useful per-repetition structure may contain:

- rep index
- ROM
- duration
- validity
- confidence
- optional movement-quality measures

Example:

```json
{
  "rep": 3,
  "rom_deg": 72,
  "duration_s": 2.4,
  "valid": true,
  "tracking_confidence": 0.94
}
```

This is an example contract, not a requirement to copy the exact field names.

## Important

Metrics should describe what was observed.

Avoid claiming that a CV metric proves a clinical diagnosis or medical condition.
