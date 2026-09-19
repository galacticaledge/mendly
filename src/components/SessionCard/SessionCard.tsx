import { useId } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/Button/Button";
import type { ButtonVariant } from "@/components/Button/Button";
import styles from "./SessionCard.module.css";

type SessionCardProps = {
  /** Short line above the title, e.g. "Today's session". */
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** The card's single action. Taken as data so the card can only ever hold one Button. */
  action: {
    label: string;
    icon?: LucideIcon;
    variant?: ButtonVariant;
  };
};

export function SessionCard({ eyebrow, title, children, action }: SessionCardProps) {
  const titleId = useId();

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <p className={`${styles.eyebrow} caption`}>{eyebrow}</p>
        <h2 id={titleId} className={`${styles.title} h2`}>
          {title}
        </h2>
      </div>
      <div className={styles.body}>{children}</div>
      <Button variant={action.variant ?? "primary"} icon={action.icon} className={styles.action}>
        {action.label}
      </Button>
    </section>
  );
}
