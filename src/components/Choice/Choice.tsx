"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import styles from "./Choice.module.css";

/**
 * Added for the questions asked after a session, and reused by the
 * practitioner's rule editor.
 *
 * It is a radio group drawn as full-width rows rather than small circles.
 * Someone answering this has just finished exercising their affected arm, so
 * the target is the whole row, and the selected state is a word plus a tick
 * rather than colour alone.
 */

export type ChoiceProps = {
  /** The question. Rendered as the group's legend. */
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  /** Lays the options out in a row on wide screens, for short answers. */
  compact?: boolean;
};

export function Choice({ label, options, value, onChange, compact = false }: ChoiceProps) {
  const name = useId();

  return (
    <fieldset className={styles.group}>
      <legend className={`${styles.legend} h3`}>{label}</legend>
      <div className={compact ? styles.rowList : styles.list}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <label
              key={option}
              className={`${styles.option} ${selected ? styles.selected : ""} body-lg`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className={styles.input}
              />
              <span className={styles.mark} aria-hidden="true">
                {selected && <Check size={20} strokeWidth={3} />}
              </span>
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
