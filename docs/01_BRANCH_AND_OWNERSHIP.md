# Branch and Ownership

## Current Branch

Working branch:

`An/flow`

Repository:

The team's shared main repository.

## Ownership

Quoc's primary technical ownership is the Computer Vision and CV-to-AI integration path.

### Primary responsibilities

- Browser-side webcam/CV integration where needed for the exercise flow
- MediaPipe Pose integration
- Pose landmark processing
- Joint-angle calculation
- Range-of-motion (ROM) calculation
- Repetition counting
- Movement-quality metrics that are feasible within the hackathon
- Tracking confidence / invalid-frame handling
- Converting CV output into structured metrics for the backend/AI layer
- Helping define the contract between CV output and adaptive exercise logic

### Secondary / later responsibilities

These are possible extensions, not first-day requirements:

- Hand Landmarker for fine-motor exercises
- Environment assessment for modality changes
- Safety anomaly / possible-collapse detection

## Not Primary Ownership

Do not assume Quoc owns:

- the entire backend
- authentication
- the database
- practitioner dashboard implementation
- the complete patient UI
- deployment infrastructure

Quoc should provide clean interfaces so those components can consume CV results.

## Current Implementation Status

Status should be treated as:

`STARTING FROM CURRENT REPOSITORY`

No feature described in the CV documentation is automatically considered implemented.

## Working Rule

Before adding a new file or framework:

1. Inspect the repository.
2. Identify the existing frontend/camera structure.
3. Reuse existing abstractions when they are reasonable.
4. Keep CV code modular enough that the team can integrate it without restructuring the whole app.
