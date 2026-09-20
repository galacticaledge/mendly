import { redirect } from "next/navigation";
import { ArrowRight, Play } from "lucide-react";
import { ActivityRow } from "@/components/ActivityRow/ActivityRow";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { SessionCard } from "@/components/SessionCard/SessionCard";
import { getSessionUser } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/patient/dashboard";
import { requireExercise } from "@/lib/exercises/catalog";
import { Landing } from "./Landing";
import styles from "./page.module.css";

/**
 * Today, for a signed-in patient. Anyone signed out gets the landing page.
 *
 * Four questions, in order, and then it stops: what should I do today, how is
 * my week going, what have I already done, what is next.
 *
 * The greeting and session card form the left column. Weekly progress and the
 * ordered exercise list form the right column. On narrow screens they stack.
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
  const nextExerciseId = remaining[0]?.exercise.id;
  const aphasia = data.uiProfile === "aphasia";

  /**
   * Which of the five things today's card is saying.
   *
   * Written out rather than nested into the card, because the states are close
   * enough to be confused and two of them are the reason this exists:
   *
   *   nothing-to-run  An approved set whose exercises the catalog no longer
   *                   knows. buildPlan drops an unrecognised id, so a set
   *                   approved before an exercise was renamed survives with an
   *                   empty plan and a session that has nothing to run.
   *   done-today      Today's session is finished. A practitioner may have
   *                   several sets approved and waiting, and finishing one used
   *                   to promote the next the instant its status changed — so
   *                   the screen offered a fresh set of exercises seconds after
   *                   the person had done today's. The next one waits for
   *                   tomorrow.
   *   questions-left  Every exercise done but the session still open. Only
   *                   reachable while it is open, because what counts as done
   *                   is the results recorded against it, so the closing
   *                   questions are still waiting and the action must stay live.
   */
  const hasOpenSession = today?.sessionId != null;
  const mode: "nothing-to-run" | "questions-left" | "resume" | "done-today" | "start" =
    today === null || today.plan.length === 0
      ? "nothing-to-run"
      : hasOpenSession
        ? remaining.length === 0
          ? "questions-left"
          : "resume"
        : data.completedToday
          ? "done-today"
          : "start";

  const unavailable = mode === "nothing-to-run" || mode === "done-today";

  const count = (n: number) => `${n} ${n === 1 ? "exercise" : "exercises"}`;

  return (
    <main className={`${styles.main} ${styles.today}`}>
      <div className={styles.focus}>
        <div className={styles.greeting}>
          <h1 className={`${styles.welcome} display`}>Hello, {data.firstName}</h1>
          <p className={`${styles.date} body-lg`}>{data.dateLabel}</p>
        </div>

        {/* 1. What should I do today */}
        {today ? (
          <SessionCard
            eyebrow={mode === "resume" || mode === "questions-left" ? "Carry on where you stopped" : "Today's session"}
            title={
              mode === "nothing-to-run"
                ? aphasia
                  ? "Nothing today"
                  : "Nothing to do today"
                : mode === "done-today"
                  ? aphasia
                    ? "All done today"
                    : "Today's session is done"
                  : mode === "questions-left"
                    ? `${count(today.plan.length)} done`
                    : mode === "start"
                      ? count(today.plan.length)
                      : `${count(remaining.length)} left`
            }
            action={{
              label:
                mode === "questions-left"
                  ? "Finish your session"
                  : mode === "resume"
                    ? "Carry on"
                    : "Start session",
              icon: aphasia ? Play : ArrowRight,
              href: "/session",
              disabled: unavailable,
            }}
            meta={
              unavailable
                ? undefined
                : aphasia
                  ? [`${today.minutes} minutes`, `${done.length} of ${today.plan.length} done`]
                  : [
                      `About ${today.minutes} minutes`,
                      `${done.length} of ${today.plan.length} exercises done`,
                    ]
            }
          >
            <p className={`${styles.text} body-lg`}>
              {mode === "nothing-to-run"
                ? aphasia
                  ? "Your care team will add exercises."
                  : "Your care team has not approved anything you can do yet. It will appear here when they do."
                : mode === "done-today"
                  ? aphasia
                    ? "Come back tomorrow."
                    : "You have done today's session. The next one will be here tomorrow."
                  : mode === "questions-left"
                    ? aphasia
                      ? "A few questions left."
                      : "That is all the exercises. A few short questions and you are finished."
                    : aphasia
                      ? "Stop any time."
                      : "You can stop at any point."}
            </p>
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
        <section
          className={`${styles.section} ${styles.weekCallout}`}
          aria-labelledby="week-heading"
          data-ground="teal"
        >
          <h2 id="week-heading" className={`${styles.heading} h2`}>
            Your week
          </h2>
          <ProgressBar
            label="Sessions this week"
            value={data.sessionsThisWeek}
            max={7}
            valueText={`${data.sessionsThisWeek} of 7 done`}
          />
          <ol className={styles.weekDays} aria-label="Sessions by day in the last seven days">
            {data.week.map((day, index) => (
              <li key={index} className={day.isToday ? styles.currentDay : undefined}>
                <span className="body-sm">{day.label.slice(0, 3)}</span>
                <span className={`${styles.dayStatus} ${day.done ? styles.dayDone : ""} label-sm`} aria-label={`${day.label}: ${day.done ? "session done" : day.isToday ? "today, no session completed yet" : "no session completed"}`}>
                  {day.done ? "✓" : day.isToday ? "Today" : "·"}
                </span>
              </li>
            ))}
          </ol>
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
                    nextUp={!complete && item.exercise.id === nextExerciseId}
                  />
                );
              })}
            </ol>
          </section>
        )}
        {today?.notes?.trim() && (
          <aside className={styles.reminder} aria-label="Care team note">
            <h2 className="label">Care team note</h2>
            <p className="body">{today.notes}</p>
          </aside>
        )}
      </div>
    </main>
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
