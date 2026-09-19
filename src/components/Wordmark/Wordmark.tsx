import styles from "./Wordmark.module.css";

/**
 * The Mendly wordmark: "Mendly." set in Chewy, the brand face. Chewy is kept
 * to this mark alone; it gets hard to read at heading and body sizes. It
 * paints in `currentColor`, so it takes the colour of whatever holds it.
 */

type WordmarkProps = {
  /** `sm` for the nav and footer, `md` for the landing header, `lg` for the sign-in panel. */
  size?: "sm" | "md" | "lg";
};

export function Wordmark({ size = "sm" }: WordmarkProps) {
  return (
    <span className={`${styles.mark} ${styles[size]}`} role="img" aria-label="Mendly">
      <span aria-hidden="true">Mendly.</span>
    </span>
  );
}
