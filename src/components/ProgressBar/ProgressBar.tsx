import { useId } from "react";
import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  /** Visible label above the bar, e.g. "This week". */
  label: string;
  value: number;
  max?: number;
  /** Printed value. Defaults to a percentage; prefer counts, e.g. "3 of 5 sessions". */
  valueText?: string;
  /** Switches the fill to accent. Only honored once value reaches max. */
  milestone?: boolean;
};

export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  milestone = false,
}: ProgressBarProps) {
  const labelId = useId();
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? Math.round((clamped / max) * 100) : 0;
  const text = valueText ?? `${percent}%`;
  const isMilestone = milestone && percent === 100;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span id={labelId} className="label">
          {label}
        </span>
        <span className={`${styles.value} body`}>{text}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
      >
        <div
          className={`${styles.fill} ${isMilestone ? styles.milestone : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
