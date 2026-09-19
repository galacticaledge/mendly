import Link from "next/link";
import { SignOut } from "./SignOut";
import styles from "./TopNav.module.css";

export type NavItem = {
  label: string;
  href: string;
};

type TopNavProps = {
  /** At most five items. */
  items: NavItem[];
  activeHref: string;
  /**
   * Widens the bar to match the practitioner pages. The patient app reads at
   * 720px; a caseload table does not, and the bar should line up with the
   * content under it either way.
   */
  wide?: boolean;
};

export function TopNav({ items, activeHref, wide = false }: TopNavProps) {
  if (process.env.NODE_ENV !== "production" && items.length > 5) {
    console.warn("TopNav takes at most five items.");
  }

  return (
    <header className={styles.bar}>
      <div className={`${styles.inner} ${wide ? styles.wide : ""}`}>
        <Link href="/" className={`${styles.wordmark} h3`}>
          Mendly
        </Link>
        <nav aria-label="Main">
          <ul className={styles.list}>
            {items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.link} ${active ? styles.active : ""} label`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <SignOut />
      </div>
    </header>
  );
}
