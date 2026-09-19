import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `primary` is the one main action on a screen. Never use it twice. */
  variant?: ButtonVariant;
  /** Optional leading icon, drawn at 24px. */
  icon?: LucideIcon;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  icon: Icon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], "label", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {Icon && <Icon size={24} aria-hidden="true" className={styles.icon} />}
      <span>{children}</span>
    </button>
  );
}
