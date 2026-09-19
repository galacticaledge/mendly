# Mendly

An AI-driven stroke rehabilitation platform. A practitioner sets the boundaries,
an AI proposes exercise sets inside them, the practitioner approves or edits
each set, the patient does it in front of a webcam, computer vision measures how
it went, and the next set is drafted from those measurements — for the
practitioner to review again.

The loop is the product. Every part of this repository exists to keep it turning
without the AI ever deciding a patient's rehabilitation on its own.

```
Practitioner defines the boundaries   (approved pool, level ceilings, exclusions)
            ↓
AI proposes an exercise set           (Gemini via Backboard, or the rules engine)
            ↓
Guardrails validate the proposal      (anything outside the boundaries is removed)
            ↓
Practitioner approves / edits / rejects
            ↓
Patient performs the approved set     (cognitive at the screen, then motor on camera)
            ↓
Computer vision measures performance  (MediaPipe Pose → angles → ROM → repetitions)
            ↓
Difficulty adapts within the approved set
            ↓
AI drafts the next set from what was measured
            ↓
Practitioner reviews again
```

## Running it

```sh
./mendly up --seed        # app + TimescaleDB + demo data, on http://localhost:3000
```

That is the whole setup. `--seed` loads three patients parked at different
points in the loop; leave it off to start empty. `./mendly reset` throws the
database away and reseeds, which is what you want before a demo.

Without Docker:

```sh
npm install
cp .env.example .env.local     # point DATABASE_URL at a PostgreSQL instance
npm run cv:assets              # copy the MediaPipe runtime and pose model into public/
npm run db:seed                # applies the schema, then loads the demo data
npm run dev
```

### Demo accounts

| Role         | Email                 | Password    | What they show                       |
|--------------|-----------------------|-------------|--------------------------------------|
| Practitioner | amara@mendly.health   | `mendly123` | Caseload, review queue, live alerts  |
| Patient      | sam@example.com       | `mendly123` | An approved session ready to start   |
| Patient      | rosa@example.com      | `mendly123` | Six weeks of history                 |
| Patient      | tunde@example.com     | `mendly123` | An open urgent alert                 |

### Optional keys

Both are optional, and the product is fully usable without either.

- `BACKBOARD_API_KEY` — the LLM service, routed to Gemini. Without it, sets are
  drafted by the local rules engine, which is deterministic and needs no
  network. Run `npm run ai:models` to see which Gemini identifiers your account
  can reach before setting `BACKBOARD_MODEL`.
- `ELEVENLABS_API_KEY` — the spoken prompts. Without it, the browser's own
  speech synthesis is used, so hands-free operation still works with a plainer
  voice.

## The planner

There is one LLM client: **Backboard**, routed to Gemini. Mendly does not talk
to Google directly and does not keep its own store of what the planner has said
before — Backboard holds the planner's conversation and memory, which is the
reason it is in the architecture at all. Each patient has one long-running
Backboard thread, so the planner builds on its previous drafts for that person
instead of starting cold every session. The thread id is the only part of that
memory Mendly stores, on the patient row.

What is still sent on every call, rather than trusted to memory, is the current
practitioner rules and the measured performance. Those are clinical facts a
practitioner audits, they change between sessions, and our database is their
source of truth. Memory carries continuity of reasoning; it does not carry the
numbers.

Backboard cannot enforce a response schema — its `json_output` guarantees valid
JSON, not a particular shape — so the shape is asked for in the system prompt
and checked on the way back by `parseProposal`, which has its own tests. A reply
that cannot be parsed is treated like an outage: the rules engine drafts the set
and the patient still gets a session.

## How the guardrails actually work

The rule from the architecture plan is "never recommend exercises that are
outside the specified parameters". A prompt cannot enforce that, so it is not
where it is enforced.

`src/lib/ai/guardrails.ts` runs on every proposal, whichever engine produced it,
before any human sees it. It removes exercises that are not in the catalog, not
in this patient's approved pool, contraindicated by tag, or standing when
standing is not permitted; it clamps any level above the practitioner's ceiling;
and it cuts the set to the agreed length and time budget. Everything it changed
is shown to the practitioner alongside the proposal.

Approval is separate and lives in the database. `getDeliverableSet` returns only
sets a practitioner has approved, and it is the only query a patient session can
start from — so no UI bug can hand an unreviewed proposal to a patient.

A practitioner may raise a level above their own earlier ceiling. They are the
authority; doing so records a new rules version, so the AI is not clamped back
down to a limit its reviewer has already overridden.

## How the measurement works

`camera → landmarks → angles → repetitions → validated metrics → AI`

- **Landmarks** come from MediaPipe Pose in the browser. Video never leaves the
  device; only the measurements are sent.
- **Angles** are computed at a named joint from three landmarks, in the image
  plane. Depth from a single webcam is the least reliable coordinate, so it is
  left out rather than allowed to add noise.
- **Smoothing** is an exponential moving average. Without it, jitter around a
  threshold would invent repetitions.
- **Repetitions** are a state machine over a full out-and-back cycle, not a
  threshold crossing. Angles are normalised to "progress from rest", so one
  machine handles joints that open and joints that close.
- **Validity** requires three things together: the movement reached the range
  asked for, its hold was actually held, and the camera saw it well enough
  throughout.
- **Tracking loss** is never hidden. Short drops are absorbed, longer ones warn
  the patient, and a repetition measured through a dropout is reported as
  unreliable rather than counted.

The adaptation policy refuses to change a level on an unreliable measurement: a
low range-of-motion reading from a body the camera could barely see is a camera
problem, and treating it as poor performance would push a patient backwards for
the wrong reason.

## Safety signals

The safety watcher raises an urgent alert only when a fast downward movement,
staying low afterwards, and staying still afterwards all hold together. Sitting
down fails the second test, bending over fails the third, and walking out of
shot is not a fall at all — it is a separate, quiet signal, because a person
leaving the room is not an emergency.

This is a prototype support signal that puts a human in the loop quickly. It is
not a clinically validated fall detector, and nothing in the product describes
it as one.

## What is where

```
src/lib/contracts.ts        Shared types. Every layer agrees on these.
src/lib/exercises/catalog   The whole universe of exercises the AI may choose from.
src/lib/ai/guardrails.ts    Validation of proposals against practitioner rules.
src/lib/ai/propose.ts       The AI pipeline: data → profile → engine → guardrails → stored.
src/lib/ai/adapt.ts         In-session difficulty policy. Deliberately not a model call.
src/lib/cv/                 Landmarks, angles, smoothing, repetitions, safety, environment.
src/lib/db/schema.sql       TimescaleDB schema. Results and alerts are hypertables.
src/app/session/            The patient session: games, camera, questions.
src/app/practitioner/       Caseload, review queue, live alerts, rules editor.
```

## Tests

```sh
npm test
```

26 tests over the two things most worth being sure about: that the guardrails
hold against a proposal breaking every rule at once, and that the repetition
counter and fall detector behave on the cases where naive versions go wrong —
jitter at rest, a movement that stops short, a hold that was never held, sitting
down quickly, bending over, and leaving the room.

## Stack

Next.js 16 · React 19 · TimescaleDB (TigerData) · MediaPipe Pose ·
Backboard (Gemini) · ElevenLabs · Docker Compose

CSS is written against the design tokens in `src/styles/tokens.css`; there is no
component library. See `CLAUDE.md` for why the palette is what it is and what
the rules around it are.

## Honest limitations

- Authentication is demo-grade: signed cookies, scrypt passwords, no rotation,
  no rate limiting, no revocation. It is not ready for real patient data.
- Exercise measurements are computed in the browser and validated server-side
  for shape and plausible range, but a determined client could still submit
  numbers it did not measure.
- The catalog is seven motor and three cognitive exercises. Wrist and finger
  work would need MediaPipe's hand landmarker, which is not wired up.
- Nothing here is a medical device, and no part of it is clinically validated.
- Patient data reaches Backboard. The planning prompt contains a named
  patient's history, goals and measured performance, and with
  `BACKBOARD_MEMORY=Auto` that content is retained in Backboard's memory store
  as well as ours. That is a data-residency and processor-agreement decision
  for whoever deploys this, not just a config value; `BACKBOARD_MEMORY=off`
  turns the retention off at the cost of the planner's continuity.
