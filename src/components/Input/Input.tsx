"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { OctagonAlert } from "lucide-react";
import styles from "./Input.module.css";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  /** Always visible above the field. A placeholder never stands in for it. */
  label: string;
  /** Helper text below the label. */
  hint?: string;
  /** Error message. Shown as a word plus an icon, never color alone. */
  error?: string;
};

export function Input({ label, hint, error, className, ...rest }: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} label`}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={`${styles.hint} body-sm`}>
          {hint}
        </p>
      )}
      <input
        id={id}
        className={[styles.input, error && styles.invalid, "body-lg", className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error && (
        <p id={errorId} className={`${styles.error} body`}>
          <OctagonAlert size={24} aria-hidden="true" className={styles.errorIcon} />
          {error}
        </p>
      )}
    </div>
  );
}
