"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The landing page's spine: one line from below the header to above the
 * footer, drawn in teal as the person scrolls. 0 at the top of the page, 1 when
 * the footer reaches the viewport.
 *
 * The timeline in "How it works" is drawn to the same point: each of its
 * segments fills as the spine's tip passes it, so the page reads as one line.
 *
 * Scroll writes `--spine-progress` once per frame. Under reduced motion there
 * is no listener at all; the CSS draws every line in full.
 */
export function ScrollSpine() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spine = ref.current;
    if (!spine || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const segments = Array.from(document.querySelectorAll<HTMLElement>("[data-spine-segment]"));
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = spine.getBoundingClientRect();
      // The spine ends where the footer begins; the page is done when that
      // edge reaches the bottom of the viewport.
      const end = rect.bottom + window.scrollY - window.innerHeight;
      const progress = end > 0 ? clamp(window.scrollY / end) : 1;
      spine.style.setProperty("--spine-progress", String(progress));

      const tip = rect.top + progress * rect.height;
      for (const segment of segments) {
        const box = segment.getBoundingClientRect();
        const fill = box.height > 0 ? clamp((tip - box.top) / box.height) : 0;
        segment.style.setProperty("--spine-progress", String(fill));
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <div ref={ref} className={`${styles.line} ${styles.spine}`} aria-hidden="true" />;
}
