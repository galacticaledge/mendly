import { requirePractitioner } from "../guard";
import { listAlerts } from "@/lib/db/queries";
import { AlertFeed } from "./AlertFeed";
import styles from "../practitioner.module.css";

export const metadata = { title: "Alerts — Mendly" };

export default async function AlertsPage() {
  const user = await requirePractitioner();
  const alerts = await listAlerts(user.id, { limit: 50 });

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <h1 className="display">Alerts</h1>
        <p className={`${styles.muted} body-lg`}>
          Raised by the camera during a session, or by what a patient told us afterwards. A camera
          signal is a prompt to check on someone, not a diagnosis.
        </p>
      </header>

      <AlertFeed
        initial={alerts.map((alert) => ({
          id: alert.id,
          time: new Date(alert.time).toISOString(),
          severity: alert.severity,
          message: alert.message,
          evidence: alert.evidence,
          acknowledged_at: alert.acknowledged_at ? new Date(alert.acknowledged_at).toISOString() : null,
          first_name: alert.first_name,
          last_name: alert.last_name,
        }))}
      />
    </main>
  );
}
