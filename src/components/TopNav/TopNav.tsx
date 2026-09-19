import Link from "next/link";
import styles from "./TopNav.module.css";

export type NavItem = {
  label: string;
  href: string;
};

type TopNavProps = {
  /** At most five items. */
  items: NavItem[];
  activeHref: string;
};

export function TopNav({ items, activeHref }: TopNavProps) {
  if (process.env.NODE_ENV !== "production" && items.length > 5) {
    console.warn("TopNav takes at most five items.");
  }

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
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
      </div>
    </header>
  );
}
