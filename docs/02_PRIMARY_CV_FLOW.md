# Primary CV Flow

## Goal

Create a working browser-side CV pipeline for at least one motor-rehabilitation exercise.

## Target Flow

```text
Webcam
  ↓
React/Vite UI
  ↓
MediaPipe Pose Landmarker
  ↓
Pose landmarks
  ↓
Landmark validation
  ↓
Smoothing / temporal filtering
  ↓
Exercise-specific metric logic
  ↓
Validated exercise result
  ↓
Backend / AI adaptation layer
```

## First Exercise

Choose one simple exercise that:

- can be performed safely in the available demo space;
- exposes clear body landmarks;
- can be measured reliably from a webcam;
- demonstrates more than simple repetition counting.

An arm-raise style exercise is a good technical starting point because shoulder/elbow/wrist landmarks provide a clear example of angle and ROM calculations.

The exact exercise should follow the team's final product design.

## What CV Should Output

CV should answer:

- Did the patient perform the movement?
- Was the repetition valid?
- What was the observed ROM?
- How long did the repetition take?
- Was tracking reliable?
- Were there observable movement-quality signals that the team has explicitly defined?

CV should not independently decide a medical treatment plan.

## Design Boundary

Computer Vision:

`camera → landmarks → measurements → validated metrics`

AI adaptation:

`validated metrics + approved rules → next exercise proposal`

The CV layer should not call the LLM on every frame.

AI should receive structured exercise/session results, not raw video frames.
