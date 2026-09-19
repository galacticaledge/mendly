import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ActivityRow } from "@/components/ActivityRow/ActivityRow";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { SessionCard } from "@/components/SessionCard/SessionCard";
import { TopNav } from "@/components/TopNav/TopNav";
import { getSessionUser } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/patient/dashboard";
import { requireExercise } from "@/lib/exercises/catalog";
import { PATIENT_NAV } from "@/lib/nav";
import styles from "./page.module.css";

/**
 * Today.
 *
 * Four questions, in order, and then it stops: what should I do today, how is
 * my week going, what have I already done, what is next.
 */
export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "practitioner") redirect("/practitioner");

  const data = await loadDashboard(user.id);
  if (!data) redirect("/login");

  const { today } = data;
  const done = today?.plan.filter((item) => today.completedExerciseIds.includes(item.exercise.id)) ?? [];
  const remaining = today?.plan.filter((item) => !today.completedExerciseIds.includes(item.exercise.id)) ?? [];

  return (
    <>
      <TopNav items={PATIENT_NAV} activeHref="/" />

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={`${styles.welcome} display`}>Hello, {data.firstName}</h1>
          <p className={`${styles.muted} body-lg`}>{data.dateLabel}</p>
        </div>

        {/* 1. What should I do today */}
        {today ? (
          <SessionCard
            eyebrow={today.sessionId ? "Carry on where you stopped" : "Today's session"}
            title={
              remaining.length === today.plan.length
                ? `${today.plan.length} exercises`
                : `${remaining.length} exercises left`
            }
            action={{
              label: today.sessionId ? "Carry on" : "Start session",
              icon: ArrowRight,
              href: "/session",
            }}
            meta={[`About ${today.minutes} minutes`, `${done.length} of ${today.plan.length} exercises done`]}
          >
            <p className={`${styles.text} body-lg`}>You can stop at any point.</p>
            {today.notes && (
              <p className={`${styles.note} body-lg`}>
                <span className="label">From your care team</span>
                {today.notes}
              </p>
            )}
          </SessionCard>
        ) : (
          <SessionCard
            eyebrow="Today's session"
            title="Nothing to do yet"
          >
            <p className={`${styles.text} body-lg`}>
              Your care team has not approved your next set of exercises. They will appear here when
              they do.
            </p>
          </SessionCard>
        )}

        {/* 2. How is my week going */}
        <section className={styles.section} aria-labelledby="week-heading">
          <h2 id="week-heading" className={`${styles.heading} h2`}>
            Your week
          </h2>
          <ProgressBar
            label="Sessions this week"
            value={data.sessionsThisWeek}
            max={7}
            valueText={`${data.sessionsThisWeek} ${data.sessionsThisWeek === 1 ? "session" : "sessions"} this week`}
          />
        </section>

        {/* 3. What have I already done */}
        {done.length > 0 && (
          <section className={styles.section} aria-labelledby="done-heading">
            <h2 id="done-heading" className={`${styles.heading} h2`}>
              Done today
            </h2>
            <ol className={`rs-activity-list ${styles.list}`}>
              {done.map((item) => (
                <ActivityRow
                  key={item.exercise.id}
                  title={item.exercise.name}
                  status={`${describe(item.exercise.id, item.level)} · Done`}
                  done
                />
              ))}
            </ol>
          </section>
        )}

        {/* 4. What is next */}
        {remaining.length > 0 && (
          <section className={styles.section} aria-labelledby="next-heading">
            <h2 id="next-heading" className={`${styles.heading} h2`}>
              Up next
            </h2>
            <ol className={`rs-activity-list ${styles.list}`} start={done.length + 1}>
              {remaining.map((item) => (
                <ActivityRow
                  key={item.exercise.id}
                  title={item.exercise.name}
                  status={`${describe(item.exercise.id, item.level)} · To do`}
                  done={false}
                />
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}

/** What the exercise asks for at this level, in the person's terms. */
function describe(exerciseId: string, level: 1 | 2 | 3 | 4 | 5): string {
  const exercise = requireExercise(exerciseId);
  const rung = exercise.levels[level - 1] ?? exercise.levels[0];

  if (exercise.modality === "motor") {
    const motor = rung as { reps: number; holdSeconds: number };
    const hold = motor.holdSeconds > 0 ? `, holding for ${motor.holdSeconds} seconds` : "";
    return `${motor.reps} times${hold}`;
  }
  const cognitive = rung as { rounds: number };
  return cognitive.rounds === 1 ? "1 round" : `${cognitive.rounds} rounds`;
}
