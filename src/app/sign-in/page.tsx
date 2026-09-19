import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import { SignInForm } from "./SignInForm";
import styles from "./signIn.module.css";

export const metadata = { title: "Sign in — Mendly" };

/**
 * One form for everyone: patients and physicians sign in here, and the server
 * decides where each goes. The brand sits on the teal panel in type, not as the
 * logo image, which is flattened onto its own teal tile and would sit badly on
 * teal-900.
 */
export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "practitioner" ? "/practitioner" : "/");

  return (
    <div className={styles.split}>
      <section className={styles.brand} aria-label="Mendly" data-ground="teal">
        <Link href="/" className={styles.wordmark}>
          <Wordmark size="lg" />
        </Link>
        <p className={`${styles.tagline} h2`}>Recovery, mended to you.</p>
        <p className={`${styles.about} body-lg`}>
          Daily rehabilitation sessions, planned by your physician, one step at a time.
        </p>
      </section>

      <main className={styles.formPanel}>
        <div className={styles.formInner}>
          <h1 className={`${styles.title} h2`}>Sign in</h1>
          <p className={`${styles.intro} body-lg`}>Use the email address your account was set up with.</p>
          <SignInForm />
          <p className={`${styles.demo} body-sm`}>
            Demo: sam@example.com (patient) or amara@mendly.health (physician), password mendly123.
          </p>
        </div>
      </main>
    </div>
  );
}
