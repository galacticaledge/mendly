# Safety CV — Optional

## Purpose

Explore a lightweight safety-anomaly signal that can alert the practitioner when the observed body motion looks abnormal.

Example:

```text
Pose stream
   ↓
rapid posture / position change
   +
persistent abnormal configuration
   ↓
possible collapse / safety anomaly
   ↓
dashboard alert
```

## Implementation Boundary

Use this only as a prototype support signal.

Do not claim that the system can reliably diagnose:

- falls
- fainting
- syncope
- medical emergencies

## Features That May Be Useful

Depending on time, combine signals such as:

- head position change
- shoulder position change
- torso orientation
- sudden body velocity/change
- persistence across multiple frames

Avoid using a single noisy coordinate threshold as the entire detector.

## Status

Stretch goal.

Priority order:

1. stable exercise tracking
2. valid metrics
3. AI integration
4. environment assessment if needed for the demo
5. safety anomaly detection
