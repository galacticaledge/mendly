import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentRules, getDeliverableSet, getPatient } from "@/lib/db/queries";
import { getExercise, getLevel, TAG_LABELS } from "@/lib/exercises/catalog";
import { isMotor } from "@/lib/contracts";
import { DEFAULT_RULES } from "@/lib/ai/propose";
import { ExerciseRow } from "@/components/ExerciseRow/ExerciseRow";
import { TopNav } from "@/components/TopNav/TopNav";
import { PATIENT_NAV } from "@/lib/nav";
import styles from "../page.module.css";

export const metadata = { title: "My plan — Mendly" };

/**
 * What the plan is and who decided it.
 *
 * This page exists to answer a question a patient is entitled to ask: why am I
 * being given these exercises? So it names the practitioner's goals, says
 * plainly that they approved this set, and shows what has been ruled out.
 */
export default async function PlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "patient") redirect("/practitioner");

  const patient = await getPatient(user.id);
  if (!patient) redirect("/login");

  const [set, rulesRow] = await Promise.all([getDeliverableSet(user.id), getCurrentRules(user.id)]);
  const rules = rulesRow?.payload ?? DEFAULT_RULES;

  return (
    <>
      <TopNav items={PATIENT_NAV} activeHref="/plan" />
      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={`${styles.welcome} display`}>Your plan</h1>
          <p className={`${styles.muted} body-lg`}>
            Your care team decides what is in your plan. Mendly suggests where to go next, and they
            check it before it reaches you.
          </p>
        </div>

        {rules.goals.length > 0 && (
          <section className={styles.section} aria-labelledby="goals-heading">
            <h2 id="goals-heading" className={`${styles.heading} h2`}>
              What you are working towards
            </h2>
            <ul className={styles.list}>
              {rules.goals.map((goal) => (
                <li key={goal} className="body-lg">
                  {goal}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section} aria-labelledby="current-heading">
          <h2 id="current-heading" className={`${styles.heading} h2`}>
            Your current session
          </h2>
          {set?.approved_exercises ? (
            <ol className={styles.list}>
              {set.approved_exercises.map((item, index) => {
                const exercise = getExercise(item.exerciseId);
                if (!exercise) return null;
                const rung = getLevel(exercise, item.level);
                const detail = isMotor(exercise)
                  ? `${(rung as { reps: number }).reps} times`
                  : `${(rung as { rounds: number }).rounds} round(s)`;
                return (
                  <ExerciseRow
                    key={item.exerciseId}
                    number={index + 1}
                    name={exercise.name}
                    detail={detail}
                    status="pending"
                  />
                );
              })}
            </ol>
          ) : (
            <p className="body-lg">Your care team has not approved a session yet.</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="limits-heading">
          <h2 id="limits-heading" className={`${styles.heading} h2`}>
            What your care team has set
          </h2>
          <ul className={styles.list}>
            <li className="body-lg">
              Standing exercises are {rules.standingAllowed ? "allowed" : "not part of your plan yet"}.
            </li>
            <li className="body-lg">
              Up to {rules.maxExercisesPerSet} exercises in a session, and about{" "}
              {rules.maxMotorMinutes} minutes of movement.
            </li>
            {rules.contraindications.map((tag) => (
              <li key={tag} className="body-lg">
                {TAG_LABELS[tag]} is not part of your plan.
              </li>
            ))}
          </ul>
          {rules.notes && <p className={`${styles.note} body-lg`}>
            <span className="caption">Note from your care team</span>
            {rules.notes}
          </p>}
        </section>
      </main>
    </>
  );
}
