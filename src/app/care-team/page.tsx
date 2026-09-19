import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getPatient, getPractitioner } from "@/lib/db/queries";
import styles from "../page.module.css";

export const metadata = { title: "Care team — Mendly" };

/** Who is looking after you, and what they can see. */
export default async function CareTeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "patient") redirect("/practitioner");

  const patient = await getPatient(user.id);
  if (!patient) redirect("/sign-in");
  const practitioner = await getPractitioner(patient.practitioner_id);

  return (
    <main className={styles.main}>
      <div className={styles.greeting}>
        <h1 className={`${styles.welcome} display`}>Your care team</h1>
      </div>

      <section className={styles.section}>
        <h2 className={`${styles.heading} h2`}>{practitioner?.full_name ?? "Your therapist"}</h2>
        <p className="body-lg">{practitioner?.role_title ?? "Therapist"}</p>
        <p className={`${styles.muted} body-lg`}>{practitioner?.email}</p>
      </section>

      <section className={styles.section} aria-labelledby="sees-heading">
        <h2 id="sees-heading" className={`${styles.heading} h2`}>
          What they can see
        </h2>
        <ul className={styles.list}>
          <li className="body-lg">Which exercises you have done, and how they went.</li>
          <li className="body-lg">Your answers to the questions at the end of a session.</li>
          <li className="body-lg">
            A message if the camera sees something that looks like a fall, so someone can check on
            you.
          </li>
        </ul>
        <p className="body-lg">
          The camera watches your movement while you exercise. Video is not recorded and does not
          leave this device — only the measurements are sent.
        </p>
      </section>
    </main>
  );
}
