# Environment CV — Optional

## Purpose

Environment assessment supports decisions about whether a different rehabilitation modality can be attempted in the current setup.

Example:

```text
Current session: seated cognitive exercise
AI recommends: standing motor exercise
                ↓
Environment assessment
                ↓
Is standing exercise feasible?
                ↓
Human confirms / overrides
```

## Important Boundary

Environment CV provides an objective feasibility signal.

It does not guarantee medical safety.

Use language such as:

- environment feasibility
- setup assessment
- safety-support signal

Avoid claiming:

- guaranteed safety
- medical-grade fall prevention
- clinical certification

## Re-check Points

Environment should be re-checked when the session needs a meaningful setup change, such as:

- switching seated → standing
- switching standing → seated when the setup changed
- camera repositioning
- noticeable environment change

Do not mechanically run a full environment assessment after every exercise.

## Status

This is optional until the primary exercise pipeline is stable.

Do not let environment CV delay the core motor exercise demo.
