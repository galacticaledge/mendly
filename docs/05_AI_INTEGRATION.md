# AI Adaptation Integration

## Role of CV

CV is responsible for producing validated observations.

Example:

```text
8 valid reps
ROM mean = 72°
tracking confidence = 0.94
movement-quality signal = defined-by-team
```

CV does not decide the rehabilitation plan.

## AI Role

The AI adaptation layer can use:

- current validated performance
- relevant session history
- practitioner-approved exercise pool
- practitioner-defined rules / constraints

to propose:

- next exercise
- difficulty
- reason for adaptation

## Guardrail

The intended flow is:

```text
Practitioner defines boundaries
        ↓
AI proposes exercise set
        ↓
Practitioner approves / edits
        ↓
Patient performs exercise
        ↓
CV measures performance
        ↓
AI adapts next exercise within approved rules
        ↓
AI proposes the next set
        ↓
Practitioner reviews again
```

The AI should not freely invent exercises outside the approved exercise pool/rules.

## CV → AI Boundary

Use structured data.

Example:

```json
{
  "exercise_id": "arm_raise",
  "valid_reps": 8,
  "rom_mean_deg": 72,
  "avg_rep_duration_s": 2.4,
  "tracking_confidence": 0.94
}
```

The actual schema must match the team's shared backend contract.

## Important

Do not send raw webcam frames to the AI adaptation layer unless the team explicitly decides to build a separate feature that requires them.

The normal path is:

`video → CV → structured metrics → AI`
