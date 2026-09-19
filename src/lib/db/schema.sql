-- Mendly schema, for TigerData (TimescaleDB on PostgreSQL).
--
-- Two kinds of table live here. Ordinary relational tables hold people, rules
-- and the exercise sets moving through practitioner review. Measurements and
-- alerts are append-only streams keyed by time, so they become hypertables:
-- results arrive continuously during a session and are almost always read as
-- "the last N for this patient", which is exactly what a hypertable is for.
--
-- The TimescaleDB extension is optional. If it is not present the hypertable
-- calls are skipped and every table stays a plain PostgreSQL table, so the
-- application also runs against stock Postgres.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TimescaleDB not available; continuing on plain PostgreSQL.';
END $$;

/* ---------------------------------------------------------------- */
/* People                                                            */
/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS practitioners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  role_title    TEXT NOT NULL DEFAULT 'Therapist',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE RESTRICT,
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  -- Clinical background the practitioner entered at intake. Held as text
  -- because it is the practitioner's own wording, shown back to them verbatim
  -- and summarised for the planning prompt.
  stroke_type     TEXT NOT NULL DEFAULT '',
  affected_side   TEXT NOT NULL DEFAULT 'right'
                  CHECK (affected_side IN ('left', 'right', 'both')),
  diagnosis_date  DATE,
  history         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patients_practitioner_idx ON patients (practitioner_id);

-- Which version of the patient interface this person sees. Added after the
-- table existed, so it is an ADD COLUMN IF NOT EXISTS: still safe to run on
-- every start, and existing patients default to the standard interface.
--   standard      the default recovery UI
--   aphasia       fewer words, a picture beside every key label, larger type
--   motor_visual  larger targets, larger type, stronger contrast
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ui_profile TEXT NOT NULL DEFAULT 'standard'
  CHECK (ui_profile IN ('standard', 'aphasia', 'motor_visual'));

/* ---------------------------------------------------------------- */
/* Practitioner rules                                                */
/* ---------------------------------------------------------------- */

-- Rules are versioned rather than updated in place: an exercise set approved
-- last week was approved under the rules as they stood then, and a reviewer
-- needs to be able to see those.
CREATE TABLE IF NOT EXISTS rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rules_patient_idx ON rules (patient_id, created_at DESC);

/* ---------------------------------------------------------------- */
/* Exercise sets: the practitioner review loop                       */
/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS exercise_sets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  rules_id          UUID REFERENCES rules(id),
  status            TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'approved', 'rejected', 'completed')),
  -- What the AI proposed, before the practitioner touched it. Kept for good:
  -- the difference between this and approved_exercises is the record of human
  -- oversight actually happening.
  proposed_exercises JSONB NOT NULL,
  ai_summary         TEXT NOT NULL DEFAULT '',
  ai_source          TEXT NOT NULL DEFAULT 'rules-engine',
  -- What the guardrail layer removed or clamped before any human saw it.
  violations         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- What the practitioner actually approved. NULL until they act.
  approved_exercises JSONB,
  practitioner_notes TEXT NOT NULL DEFAULT '',
  reviewed_by        UUID REFERENCES practitioners(id),
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_sets_patient_idx ON exercise_sets (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exercise_sets_status_idx ON exercise_sets (status);

/* ---------------------------------------------------------------- */
/* Sessions                                                          */
/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  exercise_set_id UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_patient_idx ON sessions (patient_id, started_at DESC);

CREATE TABLE IF NOT EXISTS session_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_answers_session_idx ON session_answers (session_id);

/* ---------------------------------------------------------------- */
/* Measurements — time series                                        */
/* ---------------------------------------------------------------- */

-- One row per finished exercise. `payload` is the MotorResult or
-- CognitiveResult from src/lib/contracts.ts, stored verbatim: the columns
-- beside it are only what needs to be queried or indexed.
CREATE TABLE IF NOT EXISTS exercise_results (
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  modality    TEXT NOT NULL CHECK (modality IN ('motor', 'cognitive')),
  level       SMALLINT NOT NULL,
  payload     JSONB NOT NULL,
  PRIMARY KEY (time, id)
);

CREATE INDEX IF NOT EXISTS exercise_results_patient_idx
  ON exercise_results (patient_id, time DESC);
CREATE INDEX IF NOT EXISTS exercise_results_exercise_idx
  ON exercise_results (patient_id, exercise_id, time DESC);

-- Safety and attention signals on their way to a practitioner. Urgent ones are
-- read by the dashboard's live feed within seconds of being written.
CREATE TABLE IF NOT EXISTS alerts (
  time            TIMESTAMPTZ NOT NULL DEFAULT now(),
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'attention', 'urgent')),
  message         TEXT NOT NULL,
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  PRIMARY KEY (time, id)
);

CREATE INDEX IF NOT EXISTS alerts_practitioner_idx ON alerts (practitioner_id, time DESC);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts (practitioner_id, time DESC)
  WHERE acknowledged_at IS NULL;

DO $$
BEGIN
  PERFORM create_hypertable('exercise_results', 'time', if_not_exists => TRUE, migrate_data => TRUE);
  PERFORM create_hypertable('alerts', 'time', if_not_exists => TRUE, migrate_data => TRUE);
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_hypertable() unavailable; exercise_results and alerts remain plain tables.';
END $$;
