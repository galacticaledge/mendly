import Image from "next/image";
import Link from "next/link";
import todayScreen from "../../public/landing/today.png";
import styles from "./landing.module.css";

const STEPS = [
  {
    heading: "Your physician sets the plan around your symptoms.",
    line: "They select what you need from their side, physical and cognitive both.",
  },
  {
    heading: "You see one session a day.",
    line: "Not a dashboard. One thing to do, in plain language, and you can stop any time.",
  },
  {
    heading: "Progress goes back automatically.",
    line: "Completed sessions reach your physician without anyone having to remember to report.",
  },
];

const PROMISES = [
  "Every control is at least 48 by 48 pixels.",
  "Text is never smaller than 16 pixels.",
  "Every element shows a visible focus ring.",
  "No status is signalled by color alone.",
  "Nothing moves unless you ask it to.",
];

/**
 * The public page at `/`, shown to anyone not signed in. A signed-in person
 * never sees it: the route renders Today for them, as it always has.
 *
 * Coral is spent once, on the hero's sign-in. Every other action is teal.
 */
export function Landing() {
  return (
    <>
      <header className={styles.nav}>
        <Link href="/" className={`${styles.wordmark} h3`}>
          Mendly
        </Link>
        <Link href="/sign-in" className="rs-btn rs-btn-text label">
          Sign in
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading" className={`${styles.heroTitle} display`}>
            One clear step in your recovery, every day.
          </h1>
          <p className={`${styles.heroText} body-lg`}>
            Mendly turns the plan your physician writes into a single session you can finish today.
            Built for the days when everything is harder.
          </p>
          <Link href="/sign-in" className={`rs-btn rs-btn-featured ${styles.heroAction} label`}>
            Sign in
          </Link>
        </section>

        <p className={`${styles.statement} h3`}>
          Recovery isn&apos;t only physical. Mendly puts movement and cognitive exercises in the same
          daily session, matched to the symptoms your physician records.
        </p>

        <section className={styles.section} aria-labelledby="how-heading">
          <h2 id="how-heading" className="h2">
            How it works
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.heading} className={styles.step}>
                <span className={`${styles.stepNumber} h2`} aria-hidden="true">
                  {index + 1}
                </span>
                <div className={styles.stepText}>
                  <h3 className={`${styles.stepHeading} h3`}>{step.heading}</h3>
                  <p className={`${styles.stepLine} body-lg`}>{step.line}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <figure className={styles.shot}>
          <Image
            src={todayScreen}
            alt="The Today screen: a greeting, today's session with one Carry on button, the week's progress as 2 of 7 done, and today's three exercises with one marked done."
            className={styles.shotImage}
            sizes="(max-width: 1128px) 100vw, 1080px"
          />
        </figure>

        <section className={styles.section} aria-labelledby="built-heading">
          <h2 id="built-heading" className="h2">
            Built for the people who use it
          </h2>
          <ul className={styles.promises}>
            {PROMISES.map((promise) => (
              <li key={promise} className="body-lg">
                {promise}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.closing} aria-labelledby="closing-heading">
          <h2 id="closing-heading" className="h2">
            Ready when you are.
          </h2>
          <Link href="/sign-in" className="rs-btn rs-btn-primary label">
            Sign in
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={`${styles.footerMark} label`}>Mendly</span>
        <span className="body">Recovery, mended to you.</span>
      </footer>
    </>
  );
}
