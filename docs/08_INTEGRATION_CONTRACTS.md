# CV Integration Contracts

## Goal

Make Quoc's CV module easy for the rest of the team to consume.

The exact API/database implementation belongs to the team architecture. These are interface concepts.

## Input

Typical CV input:

- webcam frames
- selected exercise definition
- configuration/thresholds
- optional session/exercise identifier

## Output

The CV layer should expose a structured result rather than UI-specific state.

Example:

```json
{
  "exercise_id": "arm_raise",
  "status": "completed",
  "valid_reps": 8,
  "rom_mean_deg": 72,
  "avg_rep_duration_s": 2.4,
  "tracking_confidence": 0.94
}
```

Optional fields may include:

```json
{
  "rom_min_deg": 61,
  "rom_max_deg": 78,
  "invalid_segments": 1
}
```

## Real-Time vs Completed Result

The system may need both:

### Real-time state

For the patient UI:

- current rep
- current phase
- tracking status
- reposition warning

### Exercise result

For backend/AI:

- completed reps
- ROM
- duration
- validity
- confidence
- other defined metrics

Do not couple AI logic directly to per-frame CV calculations.

## Ownership Boundary

```text
Quoc / CV
    ↓
Validated structured metrics
    ↓
Team backend / adaptation layer
    ↓
AI recommendation
```

The backend should be able to consume the metrics without knowing how MediaPipe works internally.
