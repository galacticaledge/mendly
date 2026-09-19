"use client";

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Select.module.css";

/**
 * Added for the practitioner's rule editor, which has to set a difficulty
 * ceiling per exercise. Built to the same rules as `Input`: 48px tall, a label
 * that is always visible, and a perceivable border.
 */

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  /** Always visible above the field. */
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
};

export function Select({ label, hint, options, className, ...rest }: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;

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
      <div className={styles.wrap}>
        <select
          id={id}
          className={[styles.select, "body-lg", className].filter(Boolean).join(" ")}
          aria-describedby={hint ? hintId : undefined}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={24} aria-hidden="true" className={styles.icon} />
      </div>
    </div>
  );
}
