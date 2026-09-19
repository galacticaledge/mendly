import { Check, Circle, OctagonAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./StatusTag.module.css";

export type StatusTone = "positive" | "caution" | "alert" | "neutral";

// Each tone has an icon with its own shape, so status never depends on color:
// tick, triangle, octagon, empty ring.
const icons: Record<StatusTone, LucideIcon> = {
  positive: Check,
  caution: TriangleAlert,
  alert: OctagonAlert,
  neutral: Circle,
};

type StatusTagProps = {
  tone: StatusTone;
  /** The status word. Always required: the word is the status, color only supports it. */
  children: string;
};

export function StatusTag({ tone, children }: StatusTagProps) {
  const Icon = icons[tone];

  return (
    <span className={`${styles.tag} ${styles[tone]} body-sm`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" className={styles.icon} />
      {children}
    </span>
  );
}
