"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { Working } from "@/components/Working/Working";
import styles from "./patient.module.css";

/**
 * Asks the AI for a fresh draft.
 *
 * Drafts are normally produced automatically when a patient finishes a session.
 * This is for the practitioner who has just changed the rules and wants to see
 * what the model does with them.
 *
 * It takes between seven and thirty seconds, nearly all of it waiting on the
 * planner, so it says where it is up to. The steps are advanced by the work
 * rather than by a timer, which is why the middle one has no end: it lasts
 * exactly as long as the model takes.
 */

/**
 * What the server does, in the order it does it (lib/ai/propose.ts).
 *
 * Two steps, not three: `router.refresh()` returns nothing to wait on, so a
 * closing "bringing it in" step would be named and replaced in the same tick
 * and nobody would ever read it. The page itself renders in about fifty
 * milliseconds once the draft exists.
 */
const STEPS = [
  "Reading their recent sessions and results",
  "Asking the planner for a draft, and checking it against your rules",
];

/**
 * How long the first step gets before the second is named.
 *
 * Reading the patient's history takes about a tenth of a second. This is not a
 * guess at that — it is long enough for the first line to be readable, so the
 * sentence does not flicker past before anyone has seen it.
 */
const READING_MS = 700;

export function RequestProposal({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setBusy(true);
    setStep(0);
    setError(null);

    const naming = setTimeout(() => setStep(1), READING_MS);

    try {
      const response = await fetch(`/api/practitioner/patients/${patientId}/propose`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "A draft could not be made.");
        return;
      }
      router.refresh();
    } catch {
      setError("Mendly could not be reached.");
    } finally {
      clearTimeout(naming);
      setBusy(false);
    }
  }

  return (
    <div className={styles.drafting}>
      <div className={styles.decisions}>
        <Button icon={Sparkle} onClick={request} disabled={busy}>
          {busy ? "Drafting" : "Draft a new set"}
        </Button>
        {error && (
          <span className={`${styles.error} body`} role="alert">
            {error}
          </span>
        )}
      </div>
      {busy && <Working steps={STEPS} step={step} />}
    </div>
  );
}
