import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentRules, getDeliverableSet, getPatient } from "@/lib/db/queries";
import { getExercise, getLevel, TAG_LABELS } from "@/lib/exercises/catalog";
import { isMotor } from "@/lib/contracts";
import { DEFAULT_RULES } from "@/lib/ai/propose";
import { ActivityRow } from "@/components/ActivityRow/ActivityRow";
import styles from "../page.module.css";
import plan from "./plan.module.css";

export const metadata = { title: "My plan — Mendly" };

/**
 * What the plan is and who decided it.
 *
 * This page exists to answer a question a patient is entitled to ask: why am I
 * being given these exercises? So it names the practitioner's goals, says
 * plainly that they approved this set, and shows what has been ruled out.
 *
 * Laid out as a multi-panel dashboard: each panel is its own surface-raised
 * card at radius-lg with shadow-resting, and nothing moves on hover. The plan
 * and the current session sit side by side; the care team's note spans below.
 */
export default async function PlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "patient") redirect("/practitioner");

  const patient = await getPatient(user.id);
  if (!patient) redirect("/sign-in");

  const [set, rulesRow] = await Promise.all([getDeliverableSet(user.id), getCurrentRules(user.id)]);
  const rules = rulesRow?.payload ?? DEFAULT_RULES;

  return (
    <main className={`${styles.main} ${styles.wide} ${plan.dashboard}`}>
      <section className={plan.panel} aria-labelledby="plan-heading">
        <h1 id="plan-heading" className={`${plan.title} h2`}>
          Your plan
        </h1>
        <p className={`${styles.text} body-lg`}>
          Your care team decides what is in your plan. Mendly suggests where to go next, and they
          check it before it reaches you.
        </p>
        {rules.goals.length > 0 && (
          <div className={styles.subsection}>
            <h2 className={`${plan.subtitle} h3`}>What you are working towards</h2>
            <ul className={plan.bullets}>
              {rules.goals.map((goal) => (
                <li key={goal} className="body-lg">
                  {goal}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={plan.panel} aria-labelledby="current-heading">
        <h2 id="current-heading" className={`${plan.title} h2`}>
          Your current session
        </h2>
        {set?.approved_exercises ? (
          <ol className={`rs-activity-list ${styles.list}`}>
            {set.approved_exercises.map((item) => {
              const exercise = getExercise(item.exerciseId);
              if (!exercise) return null;
              const rung = getLevel(exercise, item.level);
              const detail = isMotor(exercise)
                ? `${(rung as { reps: number }).reps} times`
                : `${(rung as { rounds: number }).rounds} round(s)`;
              return (
                <ActivityRow
                  key={item.exerciseId}
                  title={exercise.name}
                  status={`${detail} · To do`}
                  done={false}
                />
              );
            })}
          </ol>
        ) : (
          <p className={`${styles.text} body-lg`}>Your care team has not approved a session yet.</p>
        )}

        <div className={styles.subsection}>
          <h3 className={`${plan.subtitle} h3`}>What your care team has set</h3>
          <ul className={plan.bullets}>
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
        </div>
      </section>

      {rules.notes && (
        <section className={`${plan.panel} ${plan.full}`} aria-labelledby="note-heading">
          <h2 id="note-heading" className={`${plan.title} h2`}>
            Note from your care team
          </h2>
          <p className={`${styles.text} body-lg`}>{rules.notes}</p>
        </section>
      )}
    </main>
  );
}
