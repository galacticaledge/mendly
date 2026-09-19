import { useId } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/Button/Button";
import type { ButtonVariant } from "@/components/Button/Button";
import styles from "./SessionCard.module.css";

type SessionCardProps = {
  /** Short line above the title, e.g. "Today's session". */
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Short facts under the description, e.g. duration and exercise count. */
  meta?: string[];
  /**
   * The card's single action, taken as data so the card can only ever hold one.
   * With an `href` it renders as a link styled as the button, which is what
   * lets a server-rendered card start a flow without becoming a client
   * component. Omit it entirely for a card with nothing to do.
   */
  action?: {
    label: string;
    icon?: LucideIcon;
    variant?: ButtonVariant;
    href?: string;
    /**
     * Shown, but not available yet.
     *
     * Rendered as a disabled button even when an `href` is given, because
     * there is no such thing as a disabled link: one styled to look unavailable
     * still follows on a click, on Enter, and on a middle-click into a new tab.
     * Keeping the action visible rather than removing it says what the screen
     * would offer if there were anything to do, which is the more useful thing
     * to tell someone who came here to exercise.
     */
    disabled?: boolean;
  };
};

/**
 * The one raised panel on a screen: surface-raised, radius-lg and
 * shadow-resting together, drawn by bundle.css. At most once per screen.
 */
export function SessionCard({ eyebrow, title, children, meta, action }: SessionCardProps) {
  const titleId = useId();
  const Icon = action?.icon;
  const variant = action?.variant ?? "featured";

  return (
    <section className="rs-session-card" aria-labelledby={titleId}>
      <div className={styles.heading}>
        <p className={`${styles.eyebrow} body-sm`}>{eyebrow}</p>
        <h2 id={titleId} className={`${styles.title} h3`}>
          {title}
        </h2>
      </div>
      <div className={styles.body}>{children}</div>
      {meta && meta.length > 0 && (
        <p className={`rs-session-meta ${styles.meta} body-sm`}>
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      )}

      {action?.href && !action.disabled ? (
        <Link href={action.href} className={`rs-btn rs-btn-${variant} ${styles.action} label`}>
          {Icon && <Icon size={20} aria-hidden="true" />}
          <span>{action.label}</span>
        </Link>
      ) : action ? (
        <Button
          variant={variant}
          icon={action.icon}
          disabled={action.disabled}
          className={styles.action}
        >
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
