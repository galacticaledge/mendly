"use client";

/**
 * Reviewing what the AI proposed.
 *
 * The screen is built so that approving is not the path of least resistance in
 * a misleading way: the practitioner sees the AI's reason for every exercise,
 * what the guardrails already removed, and can change any level before
 * approving. Rejecting is a plain button beside approving, not hidden.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { GuardrailViolation, Level, ProposedExercise } from "@/lib/contracts";
import { Button } from "@/components/Button/Button";
import { Select } from "@/components/Select/Select";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import styles from "./patient.module.css";

export type ProposalReviewProps = {
  setId: string;
  exercises: (ProposedExercise & { name: string; detail: string; maxLevel: Level })[];
  summary: string;
  source: string;
  violations: GuardrailViolation[];
};

export function ProposalReview({
  setId,
  exercises,
  summary,
  source,
  violations,
}: ProposalReviewProps) {
  const router = useRouter();
  const [levels, setLevels] = useState<Record<string, Level>>(
    Object.fromEntries(exercises.map((item) => [item.exerciseId, item.level])),
  );
  const [dropped, setDropped] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = exercises.filter((item) => !dropped.includes(item.exerciseId));

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/practitioner/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes,
          exercises:
            decision === "approve"
              ? kept.map((item) => ({
                  exerciseId: item.exerciseId,
                  level: levels[item.exerciseId],
                  rationale: item.rationale,
                }))
              : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "That could not be saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("Mendly could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.review} aria-labelledby="review-heading">
      <div className={styles.reviewHead}>
        <h2 id="review-heading" className="h2">
          Waiting for your review
        </h2>
        <StatusTag tone="caution">Not sent to the patient</StatusTag>
      </div>

      <p className={`${styles.summary} body-lg`}>{summary}</p>
      <p className={`${styles.muted} body-sm`}>
        Drafted by {source === "gemini" ? "the planning model" : "the local rules engine"}. Nothing
        here reaches {"the patient"} until you approve it.
      </p>

      {violations.length > 0 && (
        <div className={styles.violations}>
          <p className="label">Already removed by your rules</p>
          <ul>
            {violations.map((violation, index) => (
              <li key={index} className="body">
                {violation.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className={styles.proposalList}>
        {exercises.map((item) => {
          const isDropped = dropped.includes(item.exerciseId);
          return (
            <li key={item.exerciseId} className={`${styles.proposalRow} ${isDropped ? styles.droppedRow : ""}`}>
              <div className={styles.proposalMain}>
                <p className="h3">{item.name}</p>
                <p className={`${styles.muted} body-sm`}>{item.detail}</p>
                <p className={`${styles.rationale} body`}>
                  <span className="caption">Why</span>
                  {item.rationale}
                </p>
              </div>

              <div className={styles.proposalControls}>
                <Select
                  label="Level"
                  value={String(levels[item.exerciseId])}
                  disabled={isDropped}
                  onChange={(event) =>
                    setLevels((current) => ({
                      ...current,
                      [item.exerciseId]: Number(event.target.value) as Level,
                    }))
                  }
                  options={[1, 2, 3, 4, 5].map((level) => ({
                    value: String(level),
                    label:
                      level > item.maxLevel
                        ? `Level ${level} — above your limit`
                        : `Level ${level}`,
                  }))}
                />
                <Button
                  onClick={() =>
                    setDropped((current) =>
                      isDropped
                        ? current.filter((id) => id !== item.exerciseId)
                        : [...current, item.exerciseId],
                    )
                  }
                >
                  {isDropped ? "Put back" : "Take out"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <label className={styles.notesField}>
        <span className="label">A note for the patient</span>
        <textarea
          className={`${styles.textarea} body-lg`}
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Shown at the start of their session."
        />
      </label>

      {error && (
        <p className={`${styles.error} body`} role="alert">
          {error}
        </p>
      )}

      <div className={styles.decisions}>
        <Button
          variant="primary"
          icon={Check}
          disabled={busy || kept.length === 0}
          onClick={() => decide("approve")}
        >
          {kept.length === 0 ? "Nothing left to approve" : `Approve ${kept.length}`}
        </Button>
        <Button icon={X} disabled={busy} onClick={() => decide("reject")}>
          Reject this set
        </Button>
      </div>
    </section>
  );
}
