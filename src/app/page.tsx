import { redirect } from "next/navigation";
import { ArrowRight, Play } from "lucide-react";
import { ActivityRow } from "@/components/ActivityRow/ActivityRow";
import { ProfileScope } from "@/components/ProfileScope/ProfileScope";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { SessionCard } from "@/components/SessionCard/SessionCard";
import { TopNav } from "@/components/TopNav/TopNav";
import { getSessionUser } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/patient/dashboard";
import { requireExercise } from "@/lib/exercises/catalog";
import { PATIENT_NAV } from "@/lib/nav";
import { Landing } from "./Landing";
import styles from "./page.module.css";

/**
 * Today, for a signed-in patient. Anyone signed out gets the landing page.
 *
 * Four questions, in order, and then it stops: what should I do today, how is
 * my week going, what have I already done, what is next.
 *
 * On a wide screen they sit side by side so all four fit without scrolling:
 * the session on the left as the focal point, the week and today's exercises
 * on the right. Below 900px they stack in the same order.
 *
 * The aphasia-friendly profile asks the same questions in fewer words: numbers
 * instead of clauses. The motor and visual-friendly profile changes size and
 * contrast only, in profiles.css.
 */
export default async function Dashboard() {
  const user = await getSessionUser();
  // Signed out, `/` is the public landing page. Signed in, it is Today.
  if (!user) return <Landing />;
  if (user.role === "practitioner") redirect("/practitioner");

  const data = await loadDashboard(user.id);
  if (!data) redirect("/sign-in");

  const { today } = data;
  const isDone = (id: string) => today?.completedExerciseIds.includes(id) ?? false;
  const done = today?.plan.filter((item) => isDone(item.exercise.id)) ?? [];
  const remaining = today?.plan.filter((item) => !isDone(item.exercise.id)) ?? [];
  const aphasia = data.uiProfile === "aphasia";

  return (
    <ProfileScope profile={data.uiProfile}>
      <TopNav items={PATIENT_NAV} activeHref="/" icons={aphasia} wide />

      <main className={`${styles.main} ${styles.today}`}>
        <div className={styles.focus}>
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
                icon: aphasia ? Play : ArrowRight,
                href: "/session",
              }}
              meta={
                aphasia
                  ? [`${today.minutes} minutes`, `${done.length} of ${today.plan.length} done`]
                  : [`About ${today.minutes} minutes`, `${done.length} of ${today.plan.length} exercises done`]
              }
            >
              <p className={`${styles.text} body-lg`}>
                {aphasia ? "Stop any time." : "You can stop at any point."}
              </p>
              {today.notes && (
                <p className={`${styles.note} body-lg`}>
                  <span className="label">From your care team</span>
                  {today.notes}
                </p>
              )}
            </SessionCard>
          ) : (
            <SessionCard eyebrow="Today's session" title={aphasia ? "Nothing today" : "Nothing to do yet"}>
              <p className={`${styles.text} body-lg`}>
                {aphasia
                  ? "Your care team will add exercises."
                  : "Your care team has not approved your next set of exercises. They will appear here when they do."}
              </p>
            </SessionCard>
          )}
        </div>

        <div className={styles.aside}>
          {/* 2. How is my week going */}
          <section className={styles.section} aria-labelledby="week-heading">
            <h2 id="week-heading" className={`${styles.heading} h2`}>
              Your week
            </h2>
            <ProgressBar
              label="Sessions this week"
              value={data.sessionsThisWeek}
              max={7}
              valueText={`${data.sessionsThisWeek} of 7 done`}
            />
          </section>

          {/* 3 and 4. What I have done and what is next, as one ordered list */}
          {today && today.plan.length > 0 && (
            <section className={styles.section} aria-labelledby="exercises-heading">
              <h2 id="exercises-heading" className={`${styles.heading} h2`}>
                Today&apos;s exercises
              </h2>
              <ol className={`rs-activity-list ${styles.list}`}>
                {today.plan.map((item) => {
                  const complete = isDone(item.exercise.id);
                  return (
                    <ActivityRow
                      key={item.exercise.id}
                      title={item.exercise.name}
                      status={`${describe(item.exercise.id, item.level, aphasia)} · ${complete ? "Done" : "To do"}`}
                      done={complete}
                    />
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      </main>
    </ProfileScope>
  );
}

/**
 * What the exercise asks for at this level, in the person's terms. `short`
 * drops the second clause, for the aphasia-friendly profile: the count alone.
 */
function describe(exerciseId: string, level: 1 | 2 | 3 | 4 | 5, short = false): string {
  const exercise = requireExercise(exerciseId);
  const rung = exercise.levels[level - 1] ?? exercise.levels[0];

  if (exercise.modality === "motor") {
    const motor = rung as { reps: number; holdSeconds: number };
    const seconds = motor.holdSeconds === 1 ? "1 second" : `${motor.holdSeconds} seconds`;
    const hold = !short && motor.holdSeconds > 0 ? `, holding for ${seconds}` : "";
    return `${motor.reps} times${hold}`;
  }
  const cognitive = rung as { rounds: number };
  return cognitive.rounds === 1 ? "1 round" : `${cognitive.rounds} rounds`;
}
