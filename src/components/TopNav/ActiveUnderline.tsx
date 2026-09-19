"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./TopNav.module.css";

/**
 * EXPERIMENT: one underline that slides to the active tab.
 *
 * The bar lives in the root layout and stays mounted across routes, so the
 * underline simply moves when `activeHref` changes. Until it has measured, the
 * active link keeps its own border, so the resting state never depends on
 * this running.
 */
export function ActiveUnderline({ activeHref }: { activeHref: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const bar = ref.current;
    const nav = bar?.parentElement;
    if (!bar || !nav) return;

    const place = () => {
      const link = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!link) return;
      const n = nav.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      // The nav scrolls sideways on a narrow screen; the underline scrolls with it.
      const x = l.left - n.left + nav.scrollLeft;
      const y = l.bottom - n.top - bar.offsetHeight;
      bar.style.transform = `translate(${x}px, ${y}px)`;
      bar.style.width = `${l.width}px`;
    };

    // On first paint and on a resize the underline jumps into place; only a
    // change of tab slides it.
    const placeInstantly = () => {
      nav.dataset.settling = "";
      place();
      void bar.offsetWidth;
      delete nav.dataset.settling;
    };

    if (nav.dataset.underline === "ready") place();
    else placeInstantly();
    nav.dataset.underline = "ready";

    window.addEventListener("resize", placeInstantly);
    return () => window.removeEventListener("resize", placeInstantly);
  }, [activeHref]);

  return <span ref={ref} className={styles.underline} aria-hidden="true" />;
}
