import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getPatient, getPractitioner } from "@/lib/db/queries";
import styles from "../page.module.css";
import { CareTeamList, type CareTeamMember } from "./CareTeamList";

export const metadata = { title: "Care team — Mendly" };

/**
 * The rest of the named team, shown so a patient can see who is involved.
 *
 * These four are display only: they live in this file and nowhere else. There
 * is no account, auth record, database row or seed data behind any of them,
 * they cannot sign in, and nothing links to them. The patient's practitioner —
 * the one read from the database below — is the only real account on this page.
 */
const DISPLAY_ONLY_MEMBERS: CareTeamMember[] = [
  { id: "display-nareh-avagyan", name: "Nareh Avagyan", role: "Physical therapist", email: "" },
  { id: "display-chris-rios", name: "Chris Rios", role: "Speech and language therapist", email: "" },
  { id: "display-quoc-bao-an-nguyen", name: "Quoc Bao An Nguyen", role: "Neurologist", email: "" },
  {
    id: "display-simren-madhusudhan",
    name: "Simren Madhusudhan",
    role: "Occupational therapist",
    email: "",
  },
];

/**
 * Who is looking after you, and what they can see. The team is a searchable
 * accordion (CareTeamList): the patient's own practitioner, read from the
 * database, then the display-only members above.
 */
export default async function CareTeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "patient") redirect("/practitioner");

  const patient = await getPatient(user.id);
  if (!patient) redirect("/sign-in");
  const practitioner = await getPractitioner(patient.practitioner_id);

  const members: CareTeamMember[] = [
    ...(practitioner
      ? [
          {
            id: practitioner.id,
            name: practitioner.full_name,
            role: practitioner.role_title,
            email: practitioner.email,
          },
        ]
      : []),
    ...DISPLAY_ONLY_MEMBERS,
  ];

  return (
    <main className={styles.main}>
      <div className={styles.greeting}>
        <h1 className={`${styles.welcome} display`}>Your care team</h1>
      </div>

      <CareTeamList members={members} />

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
