import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { countCompletedSessions, getPatient, listRecentResults } from "@/lib/db/queries";
import { getExercise } from "@/lib/exercises/catalog";
import { ProfileScope } from "@/components/ProfileScope/ProfileScope";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { TopNav } from "@/components/TopNav/TopNav";
import { PATIENT_NAV } from "@/lib/nav";
import styles from "../page.module.css";

export const metadata = { title: "History — Mendly" };

/**
 * What has been done, in the person's own terms.
 *
 * Numbers, not praise, and no charts: a count of repetitions and a range in
 * degrees is something a person can check against how the week actually felt.
 */
export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "patient") redirect("/practitioner");

  const [results, sessions, patient] = await Promise.all([
    listRecentResults(user.id, 30),
    countCompletedSessions(user.id),
    getPatient(user.id),
  ]);
  const profile = patient?.ui_profile ?? "standard";

  return (
    <ProfileScope profile={profile}>
      <TopNav items={PATIENT_NAV} activeHref="/history" icons={profile === "aphasia"} />
      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={`${styles.welcome} display`}>What you have done</h1>
          <p className={`${styles.muted} body-lg`}>
            {sessions} {sessions === 1 ? "session" : "sessions"} finished so far.
          </p>
        </div>

        <section className={styles.section}>
          {results.length === 0 ? (
            <p className="body-lg">Nothing yet. Your first session will show up here.</p>
          ) : (
            <ul className={styles.days}>
              {results.map((row) => {
                const exercise = getExercise(row.exercise_id);
                const motor = row.payload.modality === "motor" ? row.payload : null;
                const done = motor
                  ? motor.valid_reps >= motor.target_reps
                  : row.payload.modality === "cognitive" && row.payload.accuracy >= 0.7;

                return (
                  <li key={row.id} className={styles.day}>
                    <span>
                      <span className="body-lg">{exercise?.name ?? row.exercise_id}</span>
                      <br />
                      <span className={`${styles.muted} body-sm`}>
                        {new Date(row.time).toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                        {" · "}
                        {motor
                          ? `${motor.valid_reps} of ${motor.target_reps} done`
                          : row.payload.modality === "cognitive"
                            ? `${Math.round(row.payload.accuracy * 100)} out of 100 correct`
                            : ""}
                      </span>
                    </span>
                    <StatusTag tone={done ? "positive" : "neutral"}>
                      {done ? "Target met" : "Done"}
                    </StatusTag>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </ProfileScope>
  );
}
