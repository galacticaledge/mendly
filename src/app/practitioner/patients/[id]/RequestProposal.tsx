"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "lucide-react";
import { Button } from "@/components/Button/Button";
import styles from "./patient.module.css";

/**
 * Asks the AI for a fresh draft.
 *
 * Drafts are normally produced automatically when a patient finishes a session.
 * This is for the practitioner who has just changed the rules and wants to see
 * what the model does with them.
 */
export function RequestProposal({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setBusy(true);
    setError(null);
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
      setBusy(false);
    }
  }

  return (
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
  );
}
