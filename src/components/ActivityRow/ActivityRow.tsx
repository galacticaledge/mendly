import { Check } from "lucide-react";
import styles from "./ActivityRow.module.css";

type ActivityRowProps = {
  title: string;
  /** One line under the title. Carries the state in words ("Done", "To do"). */
  status: string;
  done: boolean;
};

/**
 * One row, drawn by bundle.css: a filled circle with a tick when done, an empty
 * ring when not, so the two differ by shape as well as colour. Render inside an
 * <ol> or <ul>; rows are separated by a hairline, never boxed.
 */
export function ActivityRow({ title, status, done }: ActivityRowProps) {
  return (
    <li className="rs-activity-row">
      <span className={`rs-activity-status ${done ? "is-done" : "is-pending"}`} aria-hidden="true">
        {done && <Check size={20} />}
      </span>
      <span className="rs-activity-text">
        <span className="body-lg">{title}</span>
        <span className={`${styles.status} body-sm`}>{status}</span>
      </span>
    </li>
  );
}
