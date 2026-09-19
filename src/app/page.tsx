import { ArrowRight } from "lucide-react";
import { ExerciseRow } from "@/components/ExerciseRow/ExerciseRow";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { SessionCard } from "@/components/SessionCard/SessionCard";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import type { StatusTone } from "@/components/StatusTag/StatusTag";
import { TopNav } from "@/components/TopNav/TopNav";
import { navItems, nextSession, person, today, week } from "@/lib/mock-data";
import type { DayStatus } from "@/lib/mock-data";
import styles from "./page.module.css";

const dayTags: Record<DayStatus, { tone: StatusTone; word: string }> = {
  done: { tone: "positive", word: "Done" },
  none: { tone: "neutral", word: "No session" },
  today: { tone: "neutral", word: "Today" },
  planned: { tone: "neutral", word: "Planned" },
  rest: { tone: "neutral", word: "Rest day" },
};

export default function Dashboard() {
  const { session } = today;
  const numbered = session.exercises.map((exercise, i) => ({ ...exercise, number: i + 1 }));
  const done = numbered.filter((exercise) => exercise.status === "complete");
  const remaining = numbered.filter((exercise) => exercise.status === "pending");

  return (
    <>
      <TopNav items={navItems} activeHref="/" />

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={`${styles.welcome} display`}>Hello, {person.firstName}</h1>
          <p className={`${styles.muted} body-lg`}>{today.dateLabel}</p>
        </div>

        {/* 1. What should I do today */}
        <SessionCard
          eyebrow="Today's session"
          title={session.title}
          action={{ label: "Continue session", icon: ArrowRight }}
        >
          <p className={`${styles.text} body-lg`}>
            You have {remaining.length} exercises left. This takes about {session.minutesLeft} minutes.
          </p>
          <ProgressBar
            label="Today"
            value={done.length}
            max={session.exercises.length}
            valueText={`${done.length} of ${session.exercises.length} exercises done`}
          />
        </SessionCard>

        {/* 2. How is my week going */}
        <section className={styles.section} aria-labelledby="week-heading">
          <h2 id="week-heading" className={`${styles.heading} h2`}>
            Your week
          </h2>
          <ProgressBar
            label="Sessions this week"
            value={week.sessionsDone}
            max={week.sessionsPlanned}
            valueText={`${week.sessionsDone} of ${week.sessionsPlanned} sessions done`}
          />
          <ul className={styles.days}>
            {week.days.map(({ day, status }) => (
              <li key={day} className={styles.day}>
                <span className="body-lg">{day}</span>
                <StatusTag tone={dayTags[status].tone}>{dayTags[status].word}</StatusTag>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. What have I already done */}
        <section className={styles.section} aria-labelledby="done-heading">
          <h2 id="done-heading" className={`${styles.heading} h2`}>
            Done today
          </h2>
          <ol className={styles.list}>
            {done.map((exercise) => (
              <ExerciseRow key={exercise.id} {...exercise} />
            ))}
          </ol>
        </section>

        {/* 4. What is next */}
        <section className={styles.section} aria-labelledby="next-heading">
          <h2 id="next-heading" className={`${styles.heading} h2`}>
            Up next
          </h2>
          <ol className={styles.list} start={remaining[0]?.number}>
            {remaining.map((exercise) => (
              <ExerciseRow key={exercise.id} {...exercise} />
            ))}
          </ol>
          <p className={`${styles.muted} body-lg`}>
            Your next session is on {nextSession.dateLabel}. It is {nextSession.title.toLowerCase()}.
          </p>
        </section>
      </main>
    </>
  );
}
