"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/Button/Button";
import styles from "../practitioner.module.css";

export type AcknowledgeButtonProps = {
  alertId: string;
  /**
   * Told once the server has recorded it, for a caller holding this alert in
   * its own state.
   *
   * `router.refresh()` re-renders the server component and hands down a fresh
   * list, which is enough for a page that renders alerts directly. It is not
   * enough for the live feed: that list is seeded from props once and then
   * grown by server-sent events, so a new prop cannot replace it without
   * dropping whatever arrived since. The feed updates its own copy instead.
   */
  onAcknowledged?: (alertId: string) => void;
};

/** Marks an alert as seen, so it leaves the open list. */
export function AcknowledgeButton({ alertId, onAcknowledged }: AcknowledgeButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function acknowledge() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/alerts/${alertId}/ack`, { method: "POST" });
      // Nothing is called seen until it is recorded. An alert shown as seen
      // while the database still has it open is the one outcome here that
      // could cost someone a phone call.
      if (!response.ok) {
        setFailed(true);
        return;
      }
      onAcknowledged?.(alertId);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.acknowledge}>
      <Button icon={Check} disabled={busy} onClick={acknowledge}>
        {busy ? "Marking" : "Mark as seen"}
      </Button>
      {failed && (
        <p className={`${styles.acknowledgeFailed} body-sm`} role="alert">
          Not saved. Try again.
        </p>
      )}
    </div>
  );
}
