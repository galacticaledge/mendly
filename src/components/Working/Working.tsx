"use client";

/**
 * What the app is doing while someone waits, said in words.
 *
 * Added for the practitioner asking the AI for a draft, which takes between
 * seven and thirty seconds and until now showed a disabled button reading
 * "Drafting" for the whole of it. A disabled control and no other change is
 * indistinguishable from a control that did not work, and the reasonable thing
 * to do with a button that looks broken is press it again.
 *
 * Two things it is deliberately not:
 *
 * It is not a spinner. Nothing in this product bounces, pulses or loops, and
 * that rule does not stop at the practitioner's door. The thing that moves here
 * is the sentence, and it moves because the work moved.
 *
 * It is not a progress bar. A bar would have to claim a proportion, and the
 * caller does not know one: reading the patient's history takes a tenth of a
 * second and asking the planner takes eight, so a bar sitting at "2 of 3" would
 * be wrong about where the time goes for the entire time it was on screen. The
 * count of seconds is the honest version of the same reassurance, and it is a
 * number rather than an adjective.
 *
 * The caller owns `step`, because the caller is the only one that knows when a
 * step has actually finished. Nothing here advances on its own.
 */

import { useEffect, useState } from "react";
import styles from "./Working.module.css";

/** Below this, a lapsed second counter is noise rather than reassurance. */
const COUNT_FROM_MS = 2000;

export type WorkingProps = {
  /**
   * What is happening, in order, written as something being done now. One step
   * is fine: a short save has nothing to narrate.
   */
  steps: string[];
  /** Which step is running. The caller advances it as the work advances. */
  step: number;
};

export function Working({ steps, step }: WorkingProps) {
  const current = steps[Math.min(step, steps.length - 1)] ?? steps[0];
  const [seconds, setSeconds] = useState<number | null>(null);

  // The clock starts in the effect rather than during render: reading it during
  // render is reading something that changes, and a render may be discarded.
  //
  // It counts from when this mounted, not from the current step. The person is
  // waiting on the whole thing, and a counter that reset at each step would
  // suggest the wait had started over.
  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setSeconds(elapsed >= COUNT_FROM_MS ? Math.floor(elapsed / 1000) : null);
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <p className={`${styles.working} body`} role="status" aria-live="polite">
      <span>
        {current}
        {steps.length > 1 && (
          <span className={styles.step}>
            {" "}
            &middot; step {step + 1} of {steps.length}
          </span>
        )}
      </span>
      {/* Out of the live region's way: announcing a new number every second
          would talk over the step it is meant to be supporting. */}
      {seconds !== null && (
        <span className={styles.elapsed} aria-hidden="true">
          {seconds}s
        </span>
      )}
    </p>
  );
}
