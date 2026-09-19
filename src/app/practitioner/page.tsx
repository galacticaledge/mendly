import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePractitioner } from "./guard";
import { listAlerts, listPatientsForPractitioner, listSetsAwaitingReview } from "@/lib/db/queries";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { relativeDay } from "@/lib/dates";
import styles from "./practitioner.module.css";

export const metadata = { title: "Caseload — Mendly" };

/**
 * The caseload.
 *
 * Ordered by what needs attention rather than alphabetically: open urgent
 * alerts first, then anything waiting for review. A practitioner opening this
 * between appointments should not have to look for the thing that matters.
 */
export default async function CaseloadPage() {
  // The layout has already established this is a practitioner.
  const user = await requirePractitioner();

  const [patients, awaiting, openAlerts] = await Promise.all([
    listPatientsForPractitioner(user.id),
    listSetsAwaitingReview(user.id),
    listAlerts(user.id, { openOnly: true, limit: 10 }),
  ]);

  const urgent = openAlerts.filter((alert) => alert.severity === "urgent");

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <h1 className="display">Your caseload</h1>
        <p className={`${styles.muted} body-lg`}>
          {patients.length} {patients.length === 1 ? "patient" : "patients"}.{" "}
          {awaiting.length > 0
            ? `${awaiting.length} exercise ${awaiting.length === 1 ? "set" : "sets"} waiting for you.`
            : "Nothing is waiting for review."}
        </p>
      </header>

      {urgent.length > 0 && (
        <section className={styles.urgentBar} aria-labelledby="urgent-heading">
          <h2 id="urgent-heading" className="h3">
            {urgent.length} urgent {urgent.length === 1 ? "alert" : "alerts"}
          </h2>
          <Link href="/practitioner/alerts" className={`${styles.inlineLink} label`}>
            Open alerts <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </section>
      )}

      <section aria-labelledby="patients-heading" className={styles.section}>
        <h2 id="patients-heading" className="h2">
          Patients
        </h2>

        <ul className={styles.rows}>
          {patients.map((patient) => (
            <li key={patient.id}>
              <Link href={`/practitioner/patients/${patient.id}`} className={styles.patientRow}>
                <span className={styles.patientMain}>
                  <span className="h3">
                    {patient.first_name} {patient.last_name}
                  </span>
                  <span className={`${styles.muted} body-sm`}>
                    {patient.stroke_type || "Stroke"} · {patient.affected_side} side
                  </span>
                </span>

                <span className={styles.tags}>
                  {patient.urgent_alerts > 0 && (
                    <StatusTag tone="alert">{`${patient.urgent_alerts} urgent`}</StatusTag>
                  )}
                  {patient.open_alerts > patient.urgent_alerts && (
                    <StatusTag tone="caution">
                      {`${patient.open_alerts - patient.urgent_alerts} to look at`}
                    </StatusTag>
                  )}
                  {patient.sets_awaiting_review > 0 && (
                    <StatusTag tone="caution">
                      {`${patient.sets_awaiting_review} to review`}
                    </StatusTag>
                  )}
                  {patient.open_alerts === 0 && patient.sets_awaiting_review === 0 && (
                    <StatusTag tone="positive">Up to date</StatusTag>
                  )}
                </span>

                <span className={`${styles.muted} body-sm`}>
                  {patient.last_session_at
                    ? `Last session ${relativeDay(patient.last_session_at)}`
                    : "No sessions yet"}
                </span>

                <ArrowRight size={24} aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>

        {patients.length === 0 && (
          <p className="body-lg">No patients are assigned to you yet.</p>
        )}
      </section>
    </main>
  );
}
