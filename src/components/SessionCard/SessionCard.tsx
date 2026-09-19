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
  };
};

export function SessionCard({ eyebrow, title, children, action }: SessionCardProps) {
  const titleId = useId();
  const Icon = action?.icon;

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <p className={`${styles.eyebrow} caption`}>{eyebrow}</p>
        <h2 id={titleId} className={`${styles.title} h2`}>
          {title}
        </h2>
      </div>
      <div className={styles.body}>{children}</div>

      {action?.href ? (
        <Link href={action.href} className={`${styles.action} ${styles.link} label`}>
          {Icon && <Icon size={24} aria-hidden="true" />}
          <span>{action.label}</span>
        </Link>
      ) : action ? (
        <Button variant={action.variant ?? "primary"} icon={action.icon} className={styles.action}>
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
