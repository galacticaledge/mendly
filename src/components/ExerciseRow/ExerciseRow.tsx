import { Check } from "lucide-react";
import styles from "./ExerciseRow.module.css";

type ExerciseRowProps = {
  /** Position in the session, starting at 1. */
  number: number;
  name: string;
  detail: string;
  status: "pending" | "complete";
};

/** One exercise as a list row. Render inside an <ol> or <ul>. */
export function ExerciseRow({ number, name, detail, status }: ExerciseRowProps) {
  const complete = status === "complete";

  return (
    <li className={styles.row}>
      <span className={`${styles.mark} ${complete ? styles.complete : styles.pending} label`}>
        {complete ? <Check size={24} aria-hidden="true" /> : number}
      </span>
      <span className={styles.text}>
        <span className={`${styles.name} body-lg`}>{name}</span>
        <span className={`${styles.detail} body`}>{detail}</span>
      </span>
      <span className={`${styles.status} body-sm`}>{complete ? "Done" : "To do"}</span>
    </li>
  );
}
