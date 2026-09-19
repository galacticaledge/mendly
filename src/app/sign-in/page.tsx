import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata = { title: "Sign in — Mendly" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "practitioner" ? "/practitioner" : "/");

  return (
    <main className={styles.main}>
      <div className={styles.panel}>
        <p className={`${styles.wordmark} h3`}>Mendly</p>
        <h1 className={`${styles.title} h1`}>Sign in</h1>
        <p className={`${styles.intro} body-lg`}>
          Use the email address your care team set up for you.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
