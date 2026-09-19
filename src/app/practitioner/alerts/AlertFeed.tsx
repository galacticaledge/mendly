"use client";

/**
 * The live alert feed.
 *
 * Alerts arrive over server-sent events, so a practitioner with this page open
 * sees a fall within seconds rather than on their next reload. New ones are
 * announced to screen readers through an aria-live region, and the browser tab
 * title carries the count for someone working in another tab.
 */

import { useCallback, useEffect, useState } from "react";
import type { AlertSeverity } from "@/lib/contracts";
import { AlertCard } from "@/components/AlertCard/AlertCard";
import { StatusTag } from "@/components/StatusTag/StatusTag";
import { AcknowledgeButton } from "./AcknowledgeButton";
import styles from "../practitioner.module.css";

export type FeedAlert = {
  id: string;
  time: string;
  severity: AlertSeverity;
  message: string;
  evidence: Record<string, unknown>;
  acknowledged_at: string | null;
  first_name?: string;
  last_name?: string;
};

export function AlertFeed({ initial }: { initial: FeedAlert[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/alerts/stream");

    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("alert", (event) => {
      const alert = JSON.parse((event as MessageEvent).data) as FeedAlert;
      // The stream can redeliver around a reconnect, so an id already on the
      // list is dropped rather than shown twice.
      setAlerts((current) =>
        current.some((item) => item.id === alert.id) ? current : [alert, ...current],
      );
    });
    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  /**
   * Mark one alert seen in our own copy of the list.
   *
   * This list is seeded from the server once and grown by the event stream, so
   * it cannot be rebuilt from a fresh prop — that would drop everything that
   * arrived since the page loaded. `router.refresh()` alone therefore changed
   * nothing here, and the button stayed until a reload remounted the feed.
   */
  const acknowledge = useCallback((id: string) => {
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, acknowledged_at: new Date().toISOString() } : alert,
      ),
    );
  }, []);

  const open = alerts.filter((alert) => !alert.acknowledged_at);

  useEffect(() => {
    const urgent = open.filter((alert) => alert.severity === "urgent").length;
    document.title = urgent > 0 ? `(${urgent}) Alerts — Mendly` : "Alerts — Mendly";
  }, [open]);

  return (
    <>
      <div className={styles.feedState}>
        <StatusTag tone={connected ? "positive" : "caution"}>
          {connected ? "Live" : "Not connected"}
        </StatusTag>
        <span className={`${styles.muted} body-sm`}>
          {open.length} open, {alerts.length} in the last 50.
        </span>
      </div>

      <ul className={styles.alertList} aria-live="polite" aria-relevant="additions">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            patientName={`${alert.first_name ?? ""} ${alert.last_name ?? ""}`.trim() || "Patient"}
            severity={alert.severity}
            message={alert.message}
            at={new Date(alert.time).toLocaleString("en-GB")}
            evidence={alert.evidence}
            acknowledged={Boolean(alert.acknowledged_at)}
            action={
              alert.acknowledged_at ? undefined : (
                <AcknowledgeButton alertId={alert.id} onAcknowledged={acknowledge} />
              )
            }
          />
        ))}
      </ul>

      {alerts.length === 0 && <p className="body-lg">No alerts. This page updates on its own.</p>}
    </>
  );
}
