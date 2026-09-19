import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { countCompletedSessions, listRecentResults } from "@/lib/db/queries";
import { getExercise } from "@/lib/exercises/catalog";
import type { ExerciseResult } from "@/lib/contracts";
import styles from "../page.module.css";
import history from "./history.module.css";

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

  const [results, sessions] = await Promise.all([
    listRecentResults(user.id, 30),
    countCompletedSessions(user.id),
  ]);

  return (
    <main className={`${styles.main} ${styles.wide}`}>
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
          // Focusable so a keyboard can scroll it when it overflows on a narrow screen.
          <div className={history.container} role="region" aria-label="Your exercises" tabIndex={0}>
            <table className={history.table}>
              <caption className={history.srOnly}>Your exercises, newest first.</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className={`${history.headBox} label`}>Exercise</span>
                  </th>
                  <th scope="col">
                    <span className={`${history.headBox} label`}>Date</span>
                  </th>
                  <th scope="col">
                    <span className={`${history.headBox} label`}>Progress tracker</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const exercise = getExercise(row.exercise_id);
                  const { line, share } = progress(row.payload);
                  // Fewer than half done: the row is highlighted red.
                  const low = share < 0.5;

                  return (
                    <tr key={row.id} className={low ? history.low : undefined}>
                      <th scope="row" className="body-lg">
                        {exercise?.name ?? row.exercise_id}
                      </th>
                      <td className="body-lg">
                        {new Date(row.time).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td>
                        <span className={history.tracker}>
                          <span className={history.track} aria-hidden="true">
                            <span
                              className={history.fill}
                              style={{ width: `${Math.round(Math.min(share, 1) * 100)}%` }}
                            />
                          </span>
                          <span className="body">
                            {line}
                            {low && <span className={history.srOnly}> (less than half)</span>}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * How far an exercise got: a line in words, and the share of it done
 * (repetitions against the target for movement, answers correct for a brain
 * game).
 */
function progress(result: ExerciseResult): { line: string; share: number } {
  if (result.modality === "motor") {
    return {
      line: `${result.valid_reps} of ${result.target_reps} done`,
      share: result.target_reps > 0 ? result.valid_reps / result.target_reps : 1,
    };
  }
  return {
    line: `${Math.round(result.accuracy * 100)} out of 100 correct`,
    share: result.accuracy,
  };
}
