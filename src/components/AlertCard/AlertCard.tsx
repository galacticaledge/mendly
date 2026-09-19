import { Clock, OctagonAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AlertSeverity } from "@/lib/contracts";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import type { StatusTone } from "@/components/StatusTag/StatusTag";
import styles from "./AlertCard.module.css";

/**
 * Added for the practitioner's dashboard, which had no way to show a safety
 * signal. It is a row, not a card: alerts arrive in a list and the list needs
 * to be scannable.
 *
 * Severity is carried by a word and an icon shape as well as colour, and the
 * evidence behind the signal is always shown — a practitioner deciding whether
 * to phone someone needs to see what the camera actually observed, not just a
 * conclusion drawn from it.
 */

const TONE: Record<AlertSeverity, StatusTone> = {
  urgent: "alert",
  attention: "caution",
  info: "neutral",
};

const WORD: Record<AlertSeverity, string> = {
  urgent: "Urgent",
  attention: "Needs a look",
  info: "For information",
};

const ICON: Record<AlertSeverity, LucideIcon> = {
  urgent: OctagonAlert,
  attention: TriangleAlert,
  info: Clock,
};

export type AlertCardProps = {
  patientName: string;
  severity: AlertSeverity;
  message: string;
  at: string;
  evidence?: Record<string, unknown>;
  acknowledged?: boolean;
  /** Rendered beside the alert, e.g. an acknowledge button. */
  action?: React.ReactNode;
};

export function AlertCard({
  patientName,
  severity,
  message,
  at,
  evidence,
  acknowledged = false,
  action,
}: AlertCardProps) {
  const Icon = ICON[severity];
  const entries = Object.entries(evidence ?? {});

  return (
    <li className={`${styles.row} ${styles[severity]}`}>
      <Icon size={24} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <div className={styles.head}>
          <span className={`${styles.name} h3`}>{patientName}</span>
          <StatusTag tone={TONE[severity]}>{WORD[severity]}</StatusTag>
          {acknowledged && <StatusTag tone="positive">Seen</StatusTag>}
        </div>
        <p className={`${styles.message} body`}>{message}</p>
        {entries.length > 0 && (
          <dl className={styles.evidence}>
            {entries.map(([key, value]) => (
              <div key={key} className={styles.pair}>
                <dt className="caption">{key.replace(/_/g, " ")}</dt>
                <dd className="body-sm">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className={`${styles.time} caption`}>{at}</p>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </li>
  );
}
