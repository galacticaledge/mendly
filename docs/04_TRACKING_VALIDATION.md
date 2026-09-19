# Tracking and Validation

## Why This Matters

The highest technical risk in the CV portion is not calling MediaPipe. It is producing stable, believable metrics when the person moves, rotates, leaves the frame, or is partially occluded.

## Validation Strategy

Do not reject an entire exercise because of one bad frame.

Use:

- confidence thresholds
- temporal consistency
- smoothing
- short invalid-frame tolerance
- prolonged tracking-loss detection

## Smoothing

A simple temporal smoother such as an exponential moving average can reduce jitter.

Conceptually:

```text
smoothed = alpha * current + (1 - alpha) * previous
```

Choose and test the parameter rather than copying a value blindly.

## Invalid Frames

When landmarks become unreliable:

1. mark the frame/segment as invalid;
2. do not feed obviously bad measurements into rep counting;
3. preserve valid measurements from before/after the brief loss.

If tracking loss persists:

- notify the patient to reposition;
- stop counting until reliable tracking returns;
- keep the session alive where practical.

## Tracking Confidence

The CV result should expose enough information for the UI/backend to know whether the measurement is trustworthy.

Example:

```json
{
  "tracking_confidence": 0.94,
  "tracking_valid": true
}
```

The exact scoring method should be defined by the implementation.

## Test Cases

At minimum, test:

- normal front-facing movement
- person slightly farther from camera
- person slightly closer to camera
- partial out-of-frame movement
- short occlusion
- body rotation
- different lighting
- brief tracking loss
- repeated exercise cycles

The goal is to distinguish an actual movement from tracking noise.
