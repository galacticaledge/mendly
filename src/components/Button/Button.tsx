import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The design system's four button styles, drawn by bundle.css.
 * `featured` is the one coral action on a screen. Never use it twice.
 * `primary` is the ordinary teal action, `secondary` an outlined lower-emphasis
 * one beside it, and `text` the lowest emphasis ("Cancel", "Skip for now").
 */
export type ButtonVariant = "featured" | "primary" | "secondary" | "text";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Optional leading icon, drawn at 20px in the button's text colour. */
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
  const classes = ["rs-btn", `rs-btn-${variant}`, "label", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {Icon && <Icon size={20} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
