"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/Button/Button";

/** Marks an alert as seen, so it leaves the open list. */
export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      icon={Check}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/alerts/${alertId}/ack`, { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Marking" : "Mark as seen"}
    </Button>
  );
}
