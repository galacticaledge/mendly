import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { listSetsAwaitingReview } from "@/lib/db/queries";
import { getExercise } from "@/lib/exercises/catalog";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import styles from "../practitioner.module.css";

export const metadata = { title: "To review — Mendly" };

/**
 * Everything drafted and waiting. Each row opens the patient's page, where the
 * draft is reviewed in the context of their history and rules rather than on
 * its own.
 */
export default async function ReviewQueuePage() {
  const user = (await getSessionUser())!;
  const sets = await listSetsAwaitingReview(user.id);

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <h1 className="display">Waiting for review</h1>
        <p className={`${styles.muted} body-lg`}>
          Drafted after each session. None of these have reached a patient.
        </p>
      </header>

      {sets.length === 0 ? (
        <p className="body-lg">Nothing is waiting. Drafts appear here as patients finish sessions.</p>
      ) : (
        <ul className={styles.rows}>
          {sets.map((set) => (
            <li key={set.id}>
              <Link href={`/practitioner/patients/${set.patient_id}`} className={styles.patientRow}>
                <span className={styles.patientMain}>
                  <span className="h3">
                    {set.first_name} {set.last_name}
                  </span>
                  <span className={`${styles.muted} body-sm`}>
                    {set.proposed_exercises
                      .map((item) => getExercise(item.exerciseId)?.name ?? item.exerciseId)
                      .join(" · ")}
                  </span>
                </span>

                <span className={styles.tags}>
                  <StatusTag tone="caution">
                    {`${set.proposed_exercises.length} exercises`}
                  </StatusTag>
                  {set.violations.length > 0 && (
                    <StatusTag tone="neutral">{`${set.violations.length} blocked`}</StatusTag>
                  )}
                </span>

                <span className={`${styles.muted} body-sm`}>
                  Drafted {new Date(set.created_at).toLocaleDateString("en-GB")}
                </span>

                <ArrowRight size={24} aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
