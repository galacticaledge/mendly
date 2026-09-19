import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import type { ExerciseTag, Level } from "@/lib/contracts";
import { isMotor } from "@/lib/contracts";
import {
  getCurrentRules,
  getPatient,
  listAlertsForPatient,
  listExerciseSets,
  listRecentResults,
  practitionerOwnsPatient,
} from "@/lib/db/queries";
import { CATALOG, getExercise, getLevel, TAG_LABELS } from "@/lib/exercises/catalog";
import { DEFAULT_RULES } from "@/lib/ai/propose";
import { weeksSince } from "@/lib/dates";
import { AlertCard } from "@/components/AlertCard/AlertCard";
import { UI_PROFILE_LABELS } from "@/components/ProfileScope/ProfileScope";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { ProposalReview } from "./ProposalReview";
import { RulesEditor } from "./RulesEditor";
import { RequestProposal } from "./RequestProposal";
import { AcknowledgeButton } from "../../alerts/AcknowledgeButton";
import styles from "./patient.module.css";

/**
 * One patient: what has been measured, what is waiting for review, and the
 * rules that bound everything the AI is allowed to propose.
 */
export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getSessionUser())!;
  const { id } = await params;

  if (!(await practitionerOwnsPatient(user.id, id))) notFound();

  const patient = await getPatient(id);
  if (!patient) notFound();

  const [rulesRow, sets, results, alerts] = await Promise.all([
    getCurrentRules(id),
    listExerciseSets(id, 10),
    listRecentResults(id, 12),
    listAlertsForPatient(id, 10),
  ]);

  const rules = rulesRow?.payload ?? DEFAULT_RULES;
  const pending = sets.find((set) => set.status === "proposed");

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <Link href="/practitioner" className={`${styles.back} label`}>
          Back to caseload
        </Link>
        <h1 className="display">
          {patient.first_name} {patient.last_name}
        </h1>
        <p className={`${styles.muted} body-lg`}>
          {patient.stroke_type || "Stroke"} · {patient.affected_side} side affected
          {patient.diagnosis_date && ` · ${weeksSince(patient.diagnosis_date)} weeks since diagnosis`}
        </p>
        {patient.history && <p className={`${styles.history} body`}>{patient.history}</p>}
        <p className={`${styles.muted} body`}>
          Sees the {UI_PROFILE_LABELS[patient.ui_profile].toLowerCase()} interface
        </p>
      </header>

      {/* The review step, first on the page: it is the thing that needs doing. */}
      {pending ? (
        <ProposalReview
          setId={pending.id}
          summary={pending.ai_summary}
          source={pending.ai_source}
          violations={pending.violations}
          exercises={pending.proposed_exercises.map((item) => {
            const exercise = getExercise(item.exerciseId);
            return {
              ...item,
              name: exercise?.name ?? item.exerciseId,
              detail: exercise ? describe(item.exerciseId, item.level) : "",
              maxLevel: (rules.maxLevel[item.exerciseId] ?? 1) as Level,
            };
          })}
        />
      ) : (
        <section className={styles.section}>
          <h2 className="h2">Nothing waiting for review</h2>
          <p className={`${styles.muted} body`}>
            A new set is drafted automatically each time {patient.first_name} finishes a session.
          </p>
          <RequestProposal patientId={id} />
        </section>
      )}

      {alerts.length > 0 && (
        <section className={styles.section} aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" className="h2">
            Alerts
          </h2>
          <ul className={styles.alertList}>
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                patientName={`${patient.first_name} ${patient.last_name}`}
                severity={alert.severity}
                message={alert.message}
                at={new Date(alert.time).toLocaleString("en-GB")}
                evidence={alert.evidence}
                acknowledged={Boolean(alert.acknowledged_at)}
                action={
                  alert.acknowledged_at ? undefined : <AcknowledgeButton alertId={alert.id} />
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="measured-heading">
        <h2 id="measured-heading" className="h2">
          What has been measured
        </h2>
        {results.length === 0 ? (
          <p className="body-lg">No exercises have been recorded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className="caption">When</th>
                <th className="caption">Exercise</th>
                <th className="caption">Level</th>
                <th className="caption">Result</th>
                <th className="caption">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => {
                const exercise = getExercise(row.exercise_id);
                const motor = row.payload.modality === "motor" ? row.payload : null;
                const cognitive = row.payload.modality === "cognitive" ? row.payload : null;
                return (
                  <tr key={row.id}>
                    <td className="body-sm">
                      {new Date(row.time).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="body">{exercise?.name ?? row.exercise_id}</td>
                    <td className="body">{row.level}</td>
                    <td className="body">
                      {motor
                        ? `${motor.valid_reps}/${motor.target_reps} reps · ${Math.round(motor.rom_mean_deg)}° mean`
                        : `${Math.round(cognitive!.accuracy * 100)}% correct · ${Math.round(cognitive!.avg_reaction_ms)}ms`}
                    </td>
                    <td>
                      {motor ? (
                        <StatusTag tone={motor.tracking_confidence >= 0.6 ? "positive" : "caution"}>
                          {motor.tracking_confidence.toFixed(2)}
                        </StatusTag>
                      ) : (
                        <StatusTag tone="neutral">Self-reported</StatusTag>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <RulesEditor
        patientId={id}
        rules={rules}
        tagLabels={TAG_LABELS}
        catalog={CATALOG.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          modality: exercise.modality,
          posture: isMotor(exercise) ? exercise.posture : null,
          tags: exercise.tags as ExerciseTag[],
          focus: isMotor(exercise) ? exercise.joint.name : exercise.focus,
        }))}
      />

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading" className="h2">
          Review history
        </h2>
        <ul className={styles.setList}>
          {sets
            .filter((set) => set.status !== "proposed")
            .map((set) => (
              <li key={set.id} className={styles.setRow}>
                <span className="body">
                  {new Date(set.created_at).toLocaleDateString("en-GB")} ·{" "}
                  {(set.approved_exercises ?? set.proposed_exercises).length} exercises · drafted by{" "}
                  {set.ai_source === "backboard" ? "Gemini via Backboard" : "the rules engine"}
                </span>
                <StatusTag
                  tone={
                    set.status === "rejected"
                      ? "alert"
                      : set.status === "completed"
                        ? "positive"
                        : "neutral"
                  }
                >
                  {set.status === "rejected"
                    ? "Rejected"
                    : set.status === "completed"
                      ? "Completed"
                      : "Approved"}
                </StatusTag>
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}

/** What an exercise asks for at a level, for the review row. */
function describe(exerciseId: string, level: Level): string {
  const exercise = getExercise(exerciseId);
  if (!exercise) return "";
  const rung = getLevel(exercise, level);
  if (isMotor(exercise)) {
    const motor = rung as { reps: number; targetRomDeg: number; holdSeconds: number };
    return `${motor.reps} reps through ${motor.targetRomDeg}° at the ${exercise.joint.name}${
      motor.holdSeconds > 0 ? `, ${motor.holdSeconds}s hold` : ""
    }`;
  }
  const cognitive = rung as { rounds: number; size: number };
  return `${cognitive.rounds} round(s), difficulty ${cognitive.size}`;
}
