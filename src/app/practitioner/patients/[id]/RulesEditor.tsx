"use client";

/**
 * The practitioner's boundaries for one patient.
 *
 * This is the intake step of the guardrail flow, and everything the AI is
 * allowed to do is decided here. The screen states that plainly, because a
 * practitioner who does not realise these are the limits will not set them
 * carefully.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Exercise, ExerciseTag, Level, PractitionerRules } from "@/lib/contracts";
import { Button } from "@/components/Button/Button";
import { Choice } from "@/components/Choice/Choice";
import { Select } from "@/components/Select/Select";
import styles from "./patient.module.css";

export type RulesEditorProps = {
  patientId: string;
  rules: PractitionerRules;
  catalog: {
    id: string;
    name: string;
    modality: Exercise["modality"];
    posture: string | null;
    tags: ExerciseTag[];
    focus: string;
  }[];
  tagLabels: Record<string, string>;
};

export function RulesEditor({ patientId, rules: initial, catalog, tagLabels }: RulesEditorProps) {
  const router = useRouter();
  const [rules, setRules] = useState<PractitionerRules>(initial);
  const [goalDraft, setGoalDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof PractitionerRules>(key: K, value: PractitionerRules[K]) => {
    setRules((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const toggleExercise = (id: string) => {
    const inPool = rules.allowedExerciseIds.includes(id);
    const allowedExerciseIds = inPool
      ? rules.allowedExerciseIds.filter((item) => item !== id)
      : [...rules.allowedExerciseIds, id];
    const maxLevel = { ...rules.maxLevel };
    // A ceiling only means something for an exercise in the pool. Dropping it
    // with the exercise stops a stale permission coming back if it is re-added.
    if (inPool) delete maxLevel[id];
    else maxLevel[id] = maxLevel[id] ?? 1;
    setRules((current) => ({ ...current, allowedExerciseIds, maxLevel }));
    setSaved(false);
  };

  const toggleTag = (tag: ExerciseTag) => {
    update(
      "contraindications",
      rules.contraindications.includes(tag)
        ? rules.contraindications.filter((item) => item !== tag)
        : [...rules.contraindications, tag],
    );
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/practitioner/patients/${patientId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The rules could not be saved.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Mendly could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  const allTags = Object.keys(tagLabels) as ExerciseTag[];

  return (
    <section className={styles.rules} aria-labelledby="rules-heading">
      <div>
        <h2 id="rules-heading" className="h2">
          What this patient may be asked to do
        </h2>
        <p className={`${styles.muted} body`}>
          These are the limits the planning model works inside. It can choose from the pool below
          and go no higher than the level you set. It cannot add anything else.
        </p>
      </div>

      <div className={styles.poolGroup}>
        <p className="label">Approved exercises</p>
        <ul className={styles.pool}>
          {catalog.map((exercise) => {
            const inPool = rules.allowedExerciseIds.includes(exercise.id);
            const blockedBy = exercise.tags.filter((tag) => rules.contraindications.includes(tag));
            return (
              <li key={exercise.id} className={`${styles.poolRow} ${inPool ? styles.inPool : ""}`}>
                <label className={styles.poolLabel}>
                  <input
                    type="checkbox"
                    checked={inPool}
                    onChange={() => toggleExercise(exercise.id)}
                    className={styles.checkbox}
                  />
                  <span className={styles.poolText}>
                    <span className="body-lg">{exercise.name}</span>
                    <span className={`${styles.muted} body-sm`}>
                      {exercise.modality === "motor"
                        ? `Movement, ${exercise.posture}`
                        : `At the screen, ${exercise.focus.toLowerCase()}`}
                      {blockedBy.length > 0 &&
                        ` · excluded by ${blockedBy.map((tag) => tagLabels[tag]).join(", ")}`}
                    </span>
                  </span>
                </label>

                {inPool && (
                  <Select
                    label="Highest level"
                    value={String(rules.maxLevel[exercise.id] ?? 1)}
                    onChange={(event) =>
                      setRules((current) => ({
                        ...current,
                        maxLevel: {
                          ...current.maxLevel,
                          [exercise.id]: Number(event.target.value) as Level,
                        },
                      }))
                    }
                    options={[1, 2, 3, 4, 5].map((level) => ({
                      value: String(level),
                      label: `Level ${level}`,
                    }))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <Choice
        label="Standing exercises"
        options={["Not allowed", "Allowed"]}
        value={rules.standingAllowed ? "Allowed" : "Not allowed"}
        onChange={(value) => update("standingAllowed", value === "Allowed")}
        compact
      />

      <Choice
        label="Affected side"
        options={["left", "right", "both"]}
        value={rules.affectedSide}
        onChange={(value) => update("affectedSide", value as PractitionerRules["affectedSide"])}
        compact
      />

      <div className={styles.poolGroup}>
        <p className="label">Must not be asked for</p>
        <p className={`${styles.muted} body-sm`}>
          Excluding by demand rather than by exercise, so it also covers exercises added later.
        </p>
        <div className={styles.tagRow}>
          {allTags.map((tag) => {
            const on = rules.contraindications.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`${styles.tag} ${on ? styles.tagOn : ""} body`}
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
              >
                {tagLabels[tag]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.limitRow}>
        <Select
          label="Most exercises in a set"
          value={String(rules.maxExercisesPerSet)}
          onChange={(event) => update("maxExercisesPerSet", Number(event.target.value))}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
        />
        <Select
          label="Most minutes of movement"
          value={String(rules.maxMotorMinutes)}
          onChange={(event) => update("maxMotorMinutes", Number(event.target.value))}
          options={[5, 8, 10, 12, 15, 20, 25, 30].map((n) => ({
            value: String(n),
            label: `${n} minutes`,
          }))}
        />
      </div>

      <div className={styles.poolGroup}>
        <p className="label">Rehabilitation goals</p>
        <p className={`${styles.muted} body-sm`}>
          In the patient&apos;s own terms where you can. These steer which exercises get chosen.
        </p>
        <ul className={styles.goals}>
          {rules.goals.map((goal) => (
            <li key={goal} className={`${styles.goal} body`}>
              {goal}
              <button
                type="button"
                className={`${styles.removeGoal} label`}
                onClick={() =>
                  update(
                    "goals",
                    rules.goals.filter((item) => item !== goal),
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.goalAdd}>
          <input
            className={`${styles.textInput} body-lg`}
            value={goalDraft}
            placeholder="Reach a cup on the kitchen shelf"
            onChange={(event) => setGoalDraft(event.target.value)}
            aria-label="Add a goal"
          />
          <Button
            onClick={() => {
              if (!goalDraft.trim()) return;
              update("goals", [...rules.goals, goalDraft.trim()]);
              setGoalDraft("");
            }}
          >
            Add goal
          </Button>
        </div>
      </div>

      <label className={styles.notesField}>
        <span className="label">Notes</span>
        <textarea
          className={`${styles.textarea} body-lg`}
          rows={4}
          value={rules.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Anything the planning model should take into account."
        />
      </label>

      {error && (
        <p className={`${styles.error} body`} role="alert">
          {error}
        </p>
      )}

      <div className={styles.decisions}>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving" : "Save rules"}
        </Button>
        {saved && <span className={`${styles.muted} body`}>Saved.</span>}
      </div>
    </section>
  );
}
