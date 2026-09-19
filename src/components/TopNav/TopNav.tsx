import Link from "next/link";
import { ClipboardList, History, House, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SignOut } from "./SignOut";
import styles from "./TopNav.module.css";

export type NavItem = {
  label: string;
  href: string;
};

/** A picture for each patient destination, shown beside its word when `icons` is on. */
const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/plan": ClipboardList,
  "/history": History,
  "/care-team": Users,
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
  /** Draws an icon beside each label. Used by the aphasia-friendly profile. */
  icons?: boolean;
};

export function TopNav({ items, activeHref, wide = false, icons = false }: TopNavProps) {
  if (process.env.NODE_ENV !== "production" && items.length > 5) {
    console.warn("TopNav takes at most five items.");
  }

  return (
    <header className={`rs-topnav ${styles.bar}`}>
      <div className={`${styles.inner} ${wide ? styles.wide : ""}`}>
        <Link href="/" className={`rs-topnav-mark ${styles.target} label`}>
          Mendly
        </Link>
        <nav aria-label="Main">
          <ul className={styles.list}>
            {items.map((item) => {
              const active = item.href === activeHref;
              const Icon = icons ? ICONS[item.href] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`rs-topnav-link ${styles.target} ${styles.link} label`}
                    aria-current={active ? "page" : undefined}
                  >
                    {Icon && <Icon size={24} aria-hidden="true" />}
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
