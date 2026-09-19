# Quoc / An — Hackathon Implementation Docs

## Current Context

Hackathon development has just started.

The team has a shared main repository. Quoc's current working branch is:

`An/flow`

This documentation is a working guide for the code and technical tasks that belong to Quoc during the hackathon.

## Important Status Rule

Nothing in this documentation should be interpreted as already implemented.

At the start of the hackathon, assume:

- the repository may contain only the team's initial code;
- CV components may not exist yet;
- metric calculations may not exist yet;
- AI adaptation integration may not exist yet;
- environment assessment may not exist yet;
- safety monitoring may not exist yet.

Before creating or changing code, inspect the current repository and reuse the team's existing structure where practical.

## Priority

Build the smallest reliable path first:

Camera → MediaPipe Pose → validated landmarks → exercise metrics → structured result → team integration

Only after that path works should optional CV features be added.

## Read Order

1. `01_BRANCH_AND_OWNERSHIP.md`
2. `02_PRIMARY_CV_FLOW.md`
3. `03_POSE_METRICS.md`
4. `04_TRACKING_VALIDATION.md`
5. `05_AI_INTEGRATION.md`
6. `06_ENVIRONMENT_CV.md`
7. `07_SAFETY_CV.md`
8. `08_INTEGRATION_CONTRACTS.md`
9. `09_36H_IMPLEMENTATION_PLAN.md`
10. `10_CODE_ASSISTANT_RULES.md`

## Core Principle

Do not build a large CV framework before the team has a working end-to-end demo.

The first milestone is one exercise that can be performed in front of the webcam and produces trustworthy structured metrics.
